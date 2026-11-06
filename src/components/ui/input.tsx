import * as React from 'react';
import { cn } from '@/lib/utils';
export const Input=React.forwardRef<HTMLInputElement,React.InputHTMLAttributes<HTMLInputElement>>(({className,type,...props},ref)=><input type={type} className={cn('flex h-10 w-full rounded-lg border border-[#30343e] bg-[#0b0d11] px-3 py-2 text-sm text-gray-100 placeholder:text-[#68707c] outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50',className)} ref={ref} {...props}/>);Input.displayName='Input';
