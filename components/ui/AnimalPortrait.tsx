import type { AvatarId } from "@/lib/avatars/catalog";

const outline = "#493B55";

function Cheeks({ y = 65 }: { y?: number }) {
  return <g fill="#ED9B9E" opacity=".75"><ellipse cx="28" cy={y} rx="7" ry="4" /><ellipse cx="72" cy={y} rx="7" ry="4" /></g>;
}

function Eyes({ y = 53, spread = 15 }: { y?: number; spread?: number }) {
  return <g fill={outline}><ellipse cx={50 - spread} cy={y} rx="2.8" ry="3.8" /><ellipse cx={50 + spread} cy={y} rx="2.8" ry="3.8" /></g>;
}

function Smile({ y = 66 }: { y?: number }) {
  return <path d={`M44 ${y}q6 7 12 0`} fill="none" stroke={outline} strokeWidth="2.3" strokeLinecap="round" />;
}

function Muzzle({ y = 62, nose = outline }: { y?: number; nose?: string }) {
  return <g stroke={outline} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={`m46 ${y} 4 3 4-3Z`} fill={nose} /><path d={`M50 ${y + 3}v4m0 0q-5 6-9 1m9-1q5 6 9 1`} fill="none" /></g>;
}

/** Original vector portraits share a friendly palette, with an individual silhouette for every animal. */
export function AnimalPortrait({ animal }: { animal: AvatarId }) {
  return <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden="true" focusable="false" style={{ display: "block" }}>
    <g stroke={outline} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      {animal === "cat" && <>
        <path d="M24 94c2-17 11-23 26-23s24 6 26 23" fill="#F6C567" />
        <path d="M19 51 18 23q0-7 7-3l17 11h17l16-11q7-4 7 4l-2 28c4 19-8 31-30 31S15 72 19 51Z" fill="#F9CE76" />
        <path d="m25 28 10 8-11 4Zm50 0-10 8 11 4Z" fill="#EEA28D" stroke="none" />
        <path d="m42 34 2 8m7-10v8m9-6-3 8" stroke="#D99948" strokeWidth="4" />
        <Cheeks /><Eyes /><Muzzle nose="#D18683" />
        <path d="m24 60-8-2m8 9-8 2m60-9 8-2m-8 9 8 2" strokeWidth="1.7" />
        <path d="M32 84q18 9 36 0l-2 10H34Z" fill="#9B8AC2" />
      </>}
      {animal === "rabbit" && <>
        <path d="M25 96c1-17 12-23 25-23s24 6 25 23" fill="#FBF6ED" />
        <path d="M28 37C14 1 25-6 35 12l8 22h13l8-22C75-6 85 2 72 38c11 8 15 20 8 32-6 11-17 15-30 15S24 80 20 69c-5-12-2-24 8-32Z" fill="#FFFCF5" />
        <path d="M30 30 26 13m41 17 5-17" stroke="#EDB4C1" strokeWidth="6" />
        <Cheeks /><Eyes y={54} /><Muzzle y={62} nose="#E6A0AE" />
        <path d="M32 86q18 7 36 0l-4 10H36Z" fill="#A799CD" />
        <path d="m50 89-7 7m7-7 8 7" stroke="#77659B" />
      </>}
      {animal === "dog" && <>
        <path d="M25 96c2-17 13-22 25-22s23 5 25 22" fill="#DDA77A" />
        <path d="M27 29c-12-7-18 1-18 16S7 71 20 73l15-22m38-22c12-7 18 1 18 16s2 26-11 28L65 51" fill="#B88868" />
        <path d="M24 48c0-18 10-26 26-26s26 8 26 26v14c0 16-11 24-26 24S24 78 24 62Z" fill="#EEC59C" />
        <path d="M46 24c-13 0-20 10-20 22l3 9c11 4 18-8 17-31Z" fill="#C79775" stroke="none" />
        <ellipse cx="50" cy="68" rx="16" ry="12" fill="#FFF1DD" stroke="none" />
        <Cheeks y={64} /><Eyes y={52} spread={14} /><Muzzle y={61} />
        <path d="M31 86q19 6 38 0l-3 9H34Z" fill="#82AE9A" /><circle cx="50" cy="91" r="4" fill="#F5CA69" strokeWidth="1.5" />
      </>}
      {animal === "fox" && <>
        <path d="M25 96c3-18 14-22 25-22s22 4 25 22" fill="#EB9B68" />
        <path d="m20 46-3-27q0-6 5-3l23 17h10l23-17q5-3 5 3l-3 27 7 8c-5 18-18 29-37 32-20-3-32-14-37-32Z" fill="#EEA06D" />
        <path d="m24 26 12 11-10 7Zm52 0L64 37l10 7Z" fill="#F6C8AE" stroke="none" />
        <path d="M16 56c13-5 22 1 34 13 12-12 21-18 34-13-8 18-20 25-34 28-14-3-27-10-34-28Z" fill="#FFF4DF" stroke="none" />
        <Eyes y={51} /><Cheeks y={65} /><Muzzle y={66} />
        <path d="m39 87 11 8 11-8" fill="#FFEFDA" />
      </>}
      {animal === "bear" && <>
        <path d="M24 96c2-17 13-23 26-23s24 6 26 23" fill="#CCA084" />
        <circle cx="25" cy="31" r="13" fill="#C79578" /><circle cx="75" cy="31" r="13" fill="#C79578" />
        <circle cx="25" cy="31" r="6" fill="#EABAA1" stroke="none" /><circle cx="75" cy="31" r="6" fill="#EABAA1" stroke="none" />
        <path d="M19 54c0-21 13-32 31-32s31 11 31 32-12 31-31 31-31-10-31-31Z" fill="#D8AD8D" />
        <ellipse cx="50" cy="66" rx="17" ry="13" fill="#F7DDC0" stroke="none" />
        <Cheeks y={63} /><Eyes y={50} /><Muzzle y={61} />
        <path d="M31 85q19 8 38 0l-2 11H33Z" fill="#F0C768" />
        <path d="m57 89 8 8 8-7-8-8Z" fill="#F0C768" />
      </>}
      {animal === "panda" && <>
        <path d="M24 96c3-17 13-23 26-23s23 6 26 23" fill="#666074" />
        <circle cx="25" cy="29" r="13" fill="#666074" /><circle cx="75" cy="29" r="13" fill="#666074" />
        <path d="M18 54c0-21 13-32 32-32s32 11 32 32-13 31-32 31-32-10-32-31Z" fill="#FFF9EF" />
        <ellipse cx="34" cy="51" rx="11" ry="14" transform="rotate(24 34 51)" fill="#686075" stroke="none" /><ellipse cx="66" cy="51" rx="11" ry="14" transform="rotate(-24 66 51)" fill="#686075" stroke="none" />
        <g fill="#FFF9EF" stroke="none"><ellipse cx="35" cy="51" rx="2.4" ry="3.8" /><ellipse cx="65" cy="51" rx="2.4" ry="3.8" /></g>
        <Cheeks y={66} /><Muzzle y={64} />
        <path d="M32 86q18 6 36 0l-4 10H36Z" fill="#A8C7AA" /><path d="m47 90 6 6m-3-9 7 6" stroke="#7CA27E" strokeWidth="2" />
      </>}
      {animal === "koala" && <>
        <path d="M24 96c3-17 13-23 26-23s23 6 26 23" fill="#AEB5CA" />
        <circle cx="19" cy="43" r="17" fill="#AEB5CA" /><circle cx="81" cy="43" r="17" fill="#AEB5CA" />
        <circle cx="19" cy="43" r="10" fill="#E3CAD6" stroke="none" /><circle cx="81" cy="43" r="10" fill="#E3CAD6" stroke="none" />
        <path d="M22 52c0-21 10-31 28-31s28 10 28 31v10c0 16-11 24-28 24S22 78 22 62Z" fill="#BDC4D5" />
        <path d="m40 22 8-6 3 6 9-4-1 7" fill="#BDC4D5" />
        <Cheeks y={66} /><Eyes y={51} spread={17} /><ellipse cx="50" cy="61" rx="8" ry="11" fill="#655C75" /><Smile y={76} />
        <path d="M32 86q18 7 36 0l-3 10H35Z" fill="#EBA894" />
      </>}
      {animal === "frog" && <>
        <path d="M23 96c3-17 14-23 27-23s24 6 27 23" fill="#A7C99A" />
        <path d="M20 45c-6-19 6-30 18-22l12 7 12-7c12-8 24 3 18 22 12 11 10 27 0 34-14 10-46 10-60 0-10-7-12-23 0-34Z" fill="#ACD6A0" />
        <ellipse cx="31" cy="38" rx="11" ry="12" fill="#F7F4D9" stroke="none" /><ellipse cx="69" cy="38" rx="11" ry="12" fill="#F7F4D9" stroke="none" />
        <Eyes y={38} spread={19} /><Cheeks y={64} /><path d="M29 59q21 20 42 0" strokeWidth="2.5" />
        <path d="M32 84q18 7 36 0l-3 12H35Z" fill="#EACB77" /><circle cx="50" cy="90" r="3" fill="#FFF1C3" stroke="none" />
      </>}
      {animal === "pig" && <>
        <path d="M24 96c2-17 13-23 26-23s24 6 26 23" fill="#E9AFB0" />
        <path d="M24 42c-9-8-13-24-6-26 10-3 19 9 22 16m36 10c9-8 13-24 6-26-10-3-19 9-22 16" fill="#EDB1B3" />
        <path d="M18 55c0-21 13-32 32-32s32 11 32 32-13 30-32 30-32-9-32-30Z" fill="#F4C3C2" />
        <path d="m22 23 7 11m49-11-7 11" stroke="#D98F9B" strokeWidth="4" />
        <Eyes y={49} /><Cheeks y={65} /><ellipse cx="50" cy="65" rx="15" ry="11" fill="#EAA3AD" />
        <g fill={outline} stroke="none"><ellipse cx="44" cy="65" rx="2.5" ry="3.5" /><ellipse cx="56" cy="65" rx="2.5" ry="3.5" /></g>
        <path d="M32 85q18 7 36 0l-3 11H35Z" fill="#A9B9D3" />
      </>}
      {animal === "penguin" && <>
        <path d="M19 96c-2-13 3-22 8-30V46c0-22 10-32 23-32s23 10 23 32v20c5 8 10 17 8 30" fill="#777A96" />
        <path d="M27 53c0-18 14-21 23-9 9-12 23-9 23 9v15c0 16-8 23-23 23S27 84 27 68Z" fill="#FFF9EA" stroke="none" />
        <Eyes y={53} spread={13} /><Cheeks y={67} /><path d="m43 65 7-5 7 5-7 7Z" fill="#F5C45E" />
        <path d="m23 74-6 15m60-15 6 15" />
        <path d="M25 82q25 13 50 0l-2 10q-23 10-46 0Z" fill="#A69BCC" /><path d="m60 91 4 9h10l-3-12" fill="#A69BCC" />
        <path d="m42 18 6-7 3 7 6-5 1 7" fill="#777A96" />
      </>}
      {animal === "lion" && <>
        <path d="M23 96c3-17 14-23 27-23s24 6 27 23" fill="#F1C570" />
        <path d="M50 15c9-7 18-2 20 5 11-3 18 6 15 15 10 6 11 15 4 23 5 10-1 21-12 22-1 11-12 17-22 12-10 7-20 4-24-5-12 1-19-8-16-18-10-6-11-17-3-25-3-11 3-20 13-21 5-10 16-13 25-8Z" fill="#D99D68" />
        <path d="M21 51c0-18 12-28 29-28s29 10 29 28v9c0 17-11 25-29 25S21 77 21 60Z" fill="#F6CF7B" />
        <ellipse cx="50" cy="66" rx="17" ry="13" fill="#FFEBBC" stroke="none" />
        <Eyes y={51} /><Cheeks y={65} /><Muzzle y={61} />
        <path d="m43 29 2 8m10-8-2 8" stroke="#DFAC5F" strokeWidth="3" />
        <path d="m40 88 10 7 10-7" fill="#9ABBAE" />
      </>}
      {animal === "raccoon" && <>
        <path d="M24 96c2-17 13-23 26-23s24 6 26 23" fill="#B7AAA8" />
        <path d="m21 43-5-22q0-5 5-3l21 15m37 10 5-22q0-5-5-3L58 33" fill="#AAA0A7" />
        <path d="m24 27 7 9m45-9-7 9" stroke="#E9CCD0" strokeWidth="5" />
        <path d="M17 54c0-19 14-30 33-30s33 11 33 30c0 20-15 31-33 31S17 74 17 54Z" fill="#C6BDC0" />
        <path d="M18 47c12-7 23-6 32 2 9-8 20-9 32-2l-2 18c-12 3-22-1-30-7-8 6-18 10-30 7Z" fill="#766C80" stroke="none" />
        <g fill="#FFF7E7" stroke="none"><ellipse cx="34" cy="51" rx="2.6" ry="3.7" /><ellipse cx="66" cy="51" rx="2.6" ry="3.7" /></g>
        <path d="M31 67q19-16 38 0c-6 11-32 11-38 0Z" fill="#FFF1DC" stroke="none" />
        <Cheeks y={69} /><Muzzle y={65} />
        <path d="M31 85q19 8 38 0l-4 11H35Z" fill="#E7BA71" /><path d="m50 89 4 7" />
      </>}
    </g>
  </svg>;
}
