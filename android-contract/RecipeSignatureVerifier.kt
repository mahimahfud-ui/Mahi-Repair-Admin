package com.mahirepaircloud.security

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/**
 * Verifies the exact UTF-8 bytes returned as `signed_payload` before JSON parsing,
 * then enforces the v1 contract and action-specific parameter allowlists.
 * Embed only the RSA public key in the Android APK. Never embed the private key.
 * This validates a recipe; it does not execute the recipe's actions.
 */
object RecipeSignatureVerifier {
    private val actionRisk = mapOf(
        "CHECK_INTERNET" to "read_only", "DNS_LOOKUP" to "read_only",
        "HTTPS_PROBE" to "read_only", "CHECK_APP_INSTALLED" to "read_only",
        "CHECK_STORAGE" to "read_only", "OPEN_APP" to "guided",
        "OPEN_APP_DETAILS" to "guided", "OPEN_ANDROID_SETTINGS" to "guided",
        "SHOW_GUIDE" to "guided", "ASK_USER_CONFIRMATION" to "guided",
        "REQUEST_OWN_APP_PERMISSION" to "permission", "VERIFY_INTERNET" to "read_only",
        "VERIFY_DNS" to "read_only"
    )
    private val confirmationRequired = setOf(
        "OPEN_APP", "OPEN_APP_DETAILS", "OPEN_ANDROID_SETTINGS",
        "ASK_USER_CONFIRMATION", "REQUEST_OWN_APP_PERMISSION"
    )
    private val hostPattern = Regex("^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\\.([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$")
    private val packagePattern = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")

    fun verifyAndParse(
        signedPayload: String,
        signatureBase64: String,
        publicKeyDerBase64: String
    ): JSONObject {
        val keyBytes = Base64.decode(publicKeyDerBase64, Base64.DEFAULT)
        val publicKey = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(keyBytes))
        val verifier = Signature.getInstance("SHA256withRSA")
        verifier.initVerify(publicKey)
        verifier.update(signedPayload.toByteArray(StandardCharsets.UTF_8))
        val signatureBytes = Base64.decode(signatureBase64, Base64.DEFAULT)
        require(verifier.verify(signatureBytes)) { "Recipe signature verification failed" }

        // Never parse untrusted recipe JSON before its detached signature is verified.
        val recipe = JSONObject(signedPayload)
        requireOnlyKeys(recipe, setOf("schemaVersion", "toolId", "title", "version", "category", "minAndroidApi", "minAppVersion", "estimatedSeconds", "changelog", "steps"))
        require(recipe.optInt("schemaVersion", -1) == 1) { "Unsupported recipe schema" }
        require(recipe.optString("toolId").matches(Regex("^[a-z0-9]+(?:-[a-z0-9]+)*$"))) { "Invalid tool ID" }
        require(recipe.optString("title").isNotBlank() && recipe.optString("title").length <= 100) { "Invalid recipe title" }
        require(recipe.optInt("version", 0) > 0) { "Invalid recipe version" }
        require(recipe.optString("category") in setOf("network", "apps", "storage", "connectivity", "system", "guides")) { "Invalid category" }
        require(recipe.optInt("minAndroidApi", 23) in 23..100) { "Invalid Android API requirement" }
        require(recipe.optString("minAppVersion", "1.0.0").matches(Regex("^\\d+(?:\\.\\d+){0,3}$"))) { "Invalid app version requirement" }
        require(recipe.optInt("estimatedSeconds", 60) in 1..3600) { "Invalid execution estimate" }
        require(recipe.optString("changelog", "").length <= 2000) { "Invalid changelog" }

        val steps = recipe.optJSONArray("steps") ?: error("Missing recipe steps")
        require(steps.length() in 1..50) { "Invalid step count" }
        val seen = mutableSetOf<String>()
        for (index in 0 until steps.length()) {
            val step = steps.getJSONObject(index)
            requireOnlyKeys(step, setOf("id", "action", "params", "risk", "requiresConfirmation", "condition"))
            val id = step.optString("id")
            val precedingIds = seen.toSet()
            require(id.isNotBlank() && id.length <= 80 && seen.add(id)) { "Invalid or duplicate step ID at $index" }
            val action = step.optString("action")
            require(action in actionRisk) { "Unsupported action: $action" }
            require(step.optString("risk") == actionRisk[action]) { "Incorrect risk for $action" }
            val requiresConfirmation = step.optBoolean("requiresConfirmation", false)
            require(action !in confirmationRequired || requiresConfirmation) { "$action requires confirmation" }
            val params = step.optJSONObject("params") ?: error("Invalid params for $action")
            validateParams(action, params)

            if (step.has("condition")) {
                val condition = step.getJSONObject("condition")
                requireOnlyKeys(condition, setOf("previousStep", "equals"))
                val previousId = condition.optString("previousStep")
                require(previousId in precedingIds) { "Condition must reference a preceding step" }
                require(condition.optString("equals") in setOf("success", "failure")) { "Invalid condition outcome" }
            }
        }
        return recipe
    }

    private fun validateParams(action: String, p: JSONObject) {
        fun keys(allowed: Set<String>, required: Set<String> = emptySet()) {
            requireOnlyKeys(p, allowed)
            required.forEach { require(p.has(it)) { "Missing $it for $action" } }
        }
        fun text(name: String, max: Int, min: Int = 1): String {
            val value = p.optString(name, "")
            require(value.length in min..max) { "Invalid $name for $action" }
            return value
        }
        fun host() = text("host", 253).also { require(hostPattern.matches(it)) { "Invalid host for $action" } }
        fun packageName() = text("packageName", 255, 3).also { require(packagePattern.matches(it)) { "Invalid package name for $action" } }

        when (action) {
            "CHECK_INTERNET", "VERIFY_INTERNET" -> keys(emptySet())
            "DNS_LOOKUP", "VERIFY_DNS" -> { keys(setOf("host"), setOf("host")); host() }
            "HTTPS_PROBE" -> {
                keys(setOf("host", "path", "timeoutMs"), setOf("host")); host()
                if (p.has("path")) {
                    val path = text("path", 512)
                    require(path.startsWith("/") && !path.startsWith("//") && !path.contains('\r') && !path.contains('\n')) { "Invalid HTTPS path" }
                }
                if (p.has("timeoutMs")) require(p.optInt("timeoutMs", -1) in 1000..10000) { "Invalid timeout" }
            }
            "CHECK_APP_INSTALLED", "OPEN_APP", "OPEN_APP_DETAILS" -> {
                keys(setOf("packageName"), setOf("packageName")); packageName()
            }
            "CHECK_STORAGE" -> {
                keys(setOf("minimumAvailableMb"))
                if (p.has("minimumAvailableMb")) require(p.optInt("minimumAvailableMb", -1) in 1..1_000_000) { "Invalid storage threshold" }
            }
            "OPEN_ANDROID_SETTINGS" -> {
                keys(setOf("screen"), setOf("screen"))
                require(p.optString("screen") in setOf("wifi", "internet", "bluetooth", "display", "sound", "app_notifications", "date_time", "storage")) { "Unsupported settings screen" }
            }
            "SHOW_GUIDE" -> {
                keys(setOf("title", "instructions"), setOf("title", "instructions")); text("title", 100)
                val instructions = p.optJSONArray("instructions") ?: error("Invalid instructions")
                require(instructions.length() in 1..30) { "Invalid instruction count" }
                for (i in 0 until instructions.length()) require(instructions.getString(i).isNotBlank() && instructions.getString(i).length <= 1000) { "Invalid instruction" }
            }
            "ASK_USER_CONFIRMATION" -> {
                keys(setOf("title", "message", "confirmLabel"), setOf("title", "message")); text("title", 100); text("message", 1000)
                if (p.has("confirmLabel")) text("confirmLabel", 40, 0)
            }
            "REQUEST_OWN_APP_PERMISSION" -> {
                keys(setOf("permission"), setOf("permission"))
                require(p.optString("permission") in setOf("POST_NOTIFICATIONS", "CAMERA", "ACCESS_FINE_LOCATION", "READ_MEDIA_IMAGES")) { "Unsupported app permission" }
            }
            else -> error("Unsupported action: $action")
        }
    }

    private fun requireOnlyKeys(json: JSONObject, allowed: Set<String>) {
        val keys = json.keys()
        while (keys.hasNext()) require(keys.next() in allowed) { "Unexpected JSON property" }
    }
}
