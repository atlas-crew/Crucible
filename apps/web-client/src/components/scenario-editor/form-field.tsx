"use client"

import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface FormFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
  error?: string
  /** Render a textarea instead of an input */
  multiline?: boolean
  /** Extra content (e.g. datalist) rendered after the input */
  children?: ReactNode
  /** Pass-through HTML attributes for the input */
  inputProps?: React.ComponentProps<"input">
}

export function FormField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  error,
  multiline,
  children,
  inputProps,
}: FormFieldProps) {
  const id = `ff-${label.toLowerCase().replace(/\s+/g, "-")}`
  const cls = mono ? "font-mono text-sm" : ""

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
          rows={3}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
          {...inputProps}
        />
      )}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
