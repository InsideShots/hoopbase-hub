// Simple basketball SVG icon
export function Basketball({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 2a10 10 0 0 1 10 10M12 2a10 10 0 0 0-10 10M12 22a10 10 0 0 0 10-10M12 22a10 10 0 0 1-10-10"
        fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 12h20M12 2v20" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.93 4.93C7 7 8 9.5 8 12s-1 5-3.07 7.07M19.07 4.93C17 7 16 9.5 16 12s1 5 3.07 7.07"
        fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}
