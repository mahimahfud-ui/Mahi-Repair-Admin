import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants=cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50',{
 variants:{variant:{default:'bg-red-600 text-white hover:bg-red-500',secondary:'border border-[#30343e] bg-[#171a20] text-gray-100 hover:bg-[#1d2129]',outline:'border border-[#30343e] hover:bg-[#1d2129]',ghost:'hover:bg-[#24272e]',destructive:'bg-red-950 text-red-200 hover:bg-red-900'},size:{default:'h-10 px-4 py-2',sm:'h-8 rounded-md px-3 text-xs',lg:'h-11 rounded-xl px-6',icon:'h-9 w-9'}} ,defaultVariants:{variant:'default',size:'default'}});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof buttonVariants>{asChild?:boolean}
export const Button=React.forwardRef<HTMLButtonElement,ButtonProps>(({className,variant,size,asChild=false,...props},ref)=>{const Comp=asChild?Slot:'button';return <Comp className={cn(buttonVariants({variant,size,className}))} ref={ref} {...props}/>;});Button.displayName='Button';
