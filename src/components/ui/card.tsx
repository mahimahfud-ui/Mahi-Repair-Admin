import * as React from 'react';
import { cn } from '@/lib/utils';
export function Card({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('rounded-2xl border border-[#252830] bg-[#101216] text-gray-100',className)} {...props}/>;}
export function CardHeader({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('flex flex-col space-y-1.5 p-6',className)} {...props}/>;}
export function CardTitle({className,...props}:React.HTMLAttributes<HTMLHeadingElement>){return <h3 className={cn('font-semibold leading-none tracking-tight',className)} {...props}/>;}
export function CardDescription({className,...props}:React.HTMLAttributes<HTMLParagraphElement>){return <p className={cn('text-sm text-[#9298a5]',className)} {...props}/>;}
export function CardContent({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('p-6 pt-0',className)} {...props}/>;}
