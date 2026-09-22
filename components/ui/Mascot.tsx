import { useId } from "react";

export function Mascot({ variant = "friends", className = "" }: { variant?: "friends" | "cat" | "bunny"; className?: string }) {
  const id = useId();
  return <svg className={`mascot ${className}`} viewBox="0 0 360 240" fill="none" role="img" aria-label={variant === "friends" ? "一起加油的小猫与小兔" : "正在为你加油的小伙伴"}>
    <defs><pattern id={id} width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#564C72" opacity=".14" /></pattern></defs>
    <ellipse cx="181" cy="222" rx="135" ry="12" fill="#392F55" opacity=".08" />
    <path d="M35 117l6-15 6 15 16 5-16 6-6 16-6-16-16-6 16-5Z" fill="#FBC74C" />
    <path d="M311 46l4-11 5 11 11 4-11 5-5 11-4-11-11-5 11-4Z" fill="#FA8C7B" />
    <path d="M80 37c-15-14-30 3-17 17l17 16 17-16C110 40 95 23 80 37Z" fill="#FB8E7A" />
    <path d="M272 87c9-10 21-1 13 9l-11 13-13-10c-11-9 0-21 11-12Z" fill="#9889C8" />
    {variant !== "bunny" && <g transform={variant === "cat" ? "translate(57 0)" : "translate(0 0)"}>
      <path d="M67 186c-26 10-35-12-27-24" stroke="#F7C34F" strokeWidth="17" strokeLinecap="round" />
      <path d="M66 214c-13-28-8-70 6-83l-3-54c0-9 7-10 14-4l28 24 32-1 25-24c8-7 13-2 12 7l-5 56c20 25 21 57 8 80Z" fill="#F8CC65" stroke="#493B55" strokeWidth="3" strokeLinejoin="round" />
      <path d="m77 89 15 14-15 7-0-21Zm90-1-14 15 14 7V88Z" fill="#EF9D75" />
      <ellipse cx="126" cy="191" rx="32" ry="28" fill="#FFDF93" />
      <path d="M97 131v7m54-7v7" stroke="#44344B" strokeWidth="5" strokeLinecap="round" />
      <path d="m122 142 5 4 5-4m-5 4v7m0-1c-6 8-12 2-12 0m12 0c6 8 12 2 12 0" stroke="#44344B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="89" cy="147" rx="10" ry="6" fill="#F29D80" /><ellipse cx="160" cy="147" rx="10" ry="6" fill="#F29D80" />
      <path d="M87 210v10m74-10v10M72 174l16 8m78-5 17-17" stroke="#493B55" strokeWidth="3" strokeLinecap="round" />
      <path d="m105 97 5 9m14-11v10m14-10-4 10" stroke="#DC9D47" strokeWidth="4" strokeLinecap="round" />
    </g>}
    {variant !== "cat" && <g transform={variant === "bunny" ? "translate(-65 0)" : "translate(0 0)"}>
      <path d="M198 123c-30-70-23-99-7-100 19-1 24 53 27 74 8-62 22-80 34-73 16 9-5 62-15 85 25 12 36 45 22 68 20 20 22 39 7 42h-76c-20-3-21-24-6-40-23-20-22-45 14-56Z" fill="#FDFCF8" stroke="#493B55" strokeWidth="3" strokeLinejoin="round" />
      <path d="M195 91c-13-35-17-55-8-55 8-1 12 26 16 53m25 0c9-31 15-47 18-48 9-1 0 23-10 49" stroke="#EDB4C1" strokeWidth="9" strokeLinecap="round" />
      <path d="M197 139v6m43-6v6" stroke="#493B55" strokeWidth="4.5" strokeLinecap="round" /><path d="m215 150 4 3 4-3m-4 3v5m0 0c-5 5-9 0-9 0m9 0c5 5 9 0 9 0" stroke="#493B55" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="187" cy="155" rx="10" ry="6" fill="#F6B1B4" /><ellipse cx="249" cy="155" rx="10" ry="6" fill="#F6B1B4" />
      <path d="M190 186c22 9 42 9 63-1l8 31h-77Z" fill="#A49ACB" /><path d="M191 188l-12-13m75 11 14-13M201 214v7m38-7v7" stroke="#493B55" strokeWidth="3" strokeLinecap="round" />
    </g>}
    <path d="m292 163 6-11m6 21 11-2M50 71l-5-8m8 23-11 1" stroke="#726A90" strokeWidth="3" strokeLinecap="round" />
    <circle cx="296" cy="206" r="8" fill={`url(#${id})`} /><circle cx="40" cy="198" r="12" fill={`url(#${id})`} />
  </svg>;
}

export function BrandMark() { return <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="12" fill="#FFCC59" /><path d="m10 14 1-6 7 5h6l6-5 1 7v11c-1 8-20 8-21 0V14Z" fill="#FFF4CE" /><path d="M15 21v3m10-3v3m-8 4c2 2 4 2 6 0" stroke="#46345F" strokeWidth="2.2" strokeLinecap="round" /></svg>; }
