// Fame V81: outer metal frames for preview ONLY. Not imported by the main app.
import { CLASSES } from '../js/data.js';

const PALETTE = [["#38424c","#919eaa","#dae0e4","#596672"],["#244f46","#77ad98","#d9eee3","#4c796b"],["#254e66","#70acbf","#ddf3f8","#4b8096"],["#213969","#7091c9","#dce8ff","#4d68a6"],["#4b2d61","#a084b6","#e9daee","#785b95"],["#6a304f","#c18ca7","#f6dfe9","#945d7a"],["#641e2c","#cc5761","#ffe2db","#9e394a"],["#754018","#d58e43","#ffe5b1","#b56b2c"],["#6a501d","#dab657","#fff5d8","#a88432"],["#708daa","#bad8e9","#fffcff","#dabde8"]];
let idSequence = 0;

function rivet(cx, cy, size, token) {
  return `<g><circle cx="${cx}" cy="${cy}" r="${size}" fill="url(#${token}-metal)" stroke="url(#${token}-bright)" stroke-width=".8"/>
    <circle cx="${cx-size*.22}" cy="${cy-size*.25}" r="${Math.max(.7,size*.3)}" fill="#fff" opacity=".55"/></g>`;
}
function stone(cx, cy, radius, token) {
  return `<g><path d="M${cx} ${cy-radius}L${cx+radius*.9} ${cy}L${cx} ${cy+radius}L${cx-radius*.9} ${cy}Z" fill="url(#${token}-gem)" stroke="url(#${token}-bright)" stroke-width="1.15"/>
    <path d="M${cx} ${cy-radius}V${cy+radius}M${cx-radius*.9} ${cy}H${cx+radius*.9}" fill="none" stroke="#fff" stroke-opacity=".66" stroke-width=".8"/>
    <path d="M${cx} ${cy-radius}L${cx+radius*.24} ${cy}L${cx-radius*.9} ${cy}Z" fill="#fff" opacity=".38"/></g>`;
}
function cornerStyle(cls, token) {
  const L=`url(#${token}-bright)`, M=`url(#${token}-metal)`;
  let out=`<path d="M14 49V29L29 14H49" stroke="${L}" stroke-width="1.5" opacity=".76" fill="none"/>`;
  if(cls>=1) out+=`<path d="M7 48V26L26 7H48" stroke="${M}" stroke-width="2.1" fill="none" opacity=".88"/>`;
  if(cls>=2) out+=`<path d="M12 59V32L32 12H60" stroke="${L}" stroke-width=".9" opacity=".72" fill="none"/>`;
  if(cls>=3) out+=`<path d="M13 15L20 8H36L30 15Z" fill="${M}" opacity=".72"/><path d="M8 37L15 30V41L8 48Z" fill="${M}" opacity=".75"/>`;
  if(cls>=4) out+=`<path d="M17 47Q20 28 44 17" fill="none" stroke="${L}" stroke-width="1.2" opacity=".68"/>`;
  if(cls>=5) out+=rivet(12,12,4.7,token);
  if(cls>=6) out+=stone(12,12,7.6,token);
  if(cls>=7) out+=`<path d="M6 62V31L31 6H62" fill="none" stroke="${L}" stroke-width="1.4"/>`;
  if(cls>=8) out+=`<path d="M4 66V28L28 4H66M16 52V35L35 16H52" stroke="${M}" stroke-width="1.6" fill="none" opacity=".92"/>`;
  if(cls>=9) out+=`<path d="M9 68V30L30 9H68" stroke="#fff" stroke-width=".8" opacity=".8" fill="none"/>`;
  return out;
}

// The mask cuts away the entire centre, including where the live stone,
// serial, brand, name, seal, buttons and slogans are drawn.
export function outsideMetalFrameSvg(classIndex) {
  const cls=Math.max(0,Math.min(9,Number(classIndex)||0));
  const color=CLASSES[cls].color;
  const [dark,mid,light,shade]=PALETTE[cls];
  const token="outer-metal-"+(++idSequence);
  const holo=cls===9;
  const metalStops=holo?["#e2def6","#b7dfeb","#fff6d7","#d8bcf2","#dcfff0","#f3d6df","#e2def6"]:[dark,mid,light,shade,mid,light,dark];
  const stops=metalStops.map((x,i)=>`<stop offset="${(100*i/(metalStops.length-1)).toFixed(1)}%" stop-color="${x}"/>`).join("");
  const c=cornerStyle(cls,token);
  const corners=`<g>${c}</g><g transform="translate(320 0) scale(-1 1)">${c}</g><g transform="translate(0 470) scale(1 -1)">${c}</g><g transform="translate(320 470) scale(-1 -1)">${c}</g>`;
  const width=[2.7,3,3.2,3.5,3.6,4,4.5,4.8,5.5,6.2][cls];
  let extras="";
  if(cls>=2)extras+=`<path d="M11 69V135M309 69V135M11 335V401M309 335V401" fill="none" stroke="url(#${token}-bright)" stroke-width=".85" opacity=".64"/>`;
  if(cls>=3)extras+=`<path d="M9 165L14 174L9 183M311 165L306 174L311 183M9 286L14 295L9 304M311 286L306 295L311 304" stroke="url(#${token}-metal)" stroke-width="2.5" fill="none"/>`;
  if(cls>=4)extras+=`<path d="M67 10L79 14L92 10M253 10L241 14L228 10M67 460L79 456L92 460M253 460L241 456L228 460" stroke="url(#${token}-bright)" fill="none" stroke-width="1.3" opacity=".76"/>`;
  if(cls>=5)extras+=`<path d="M11 106Q19 118 11 130M309 106Q301 118 309 130M11 340Q19 352 11 364M309 340Q301 352 309 364" stroke="url(#${token}-metal)" stroke-width="1.7" fill="none"/>`;
  if(cls>=6)extras+=`${rivet(9,235,4.7,token)}${rivet(311,235,4.7,token)}`;
  if(cls>=7)extras+=`${stone(160,11,8.5,token)}${stone(160,459,8.5,token)}`;
  if(cls>=8)extras+=`<path d="M99 10L116 13L131 10L160 4L189 10L204 13L221 10M99 460L116 457L131 460L160 466L189 460L204 457L221 460" fill="none" stroke="url(#${token}-bright)" stroke-width="1.65"/>${stone(9,235,8.5,token)}${stone(311,235,8.5,token)}`;
  if(cls===9)extras+=`<path d="M20 9H85M235 9H300M20 461H85M235 461H300" stroke="#fff" stroke-opacity=".7" stroke-width="1.3"/>${stone(160,11,11,token)}${stone(160,459,11,token)}`;
  const glowOpacity=cls<6?.12:cls<8?.22:cls===8?.28:.36;
  return `<svg class="famecard-outside-svg outside-level-${cls+1}" viewBox="0 0 320 470" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${token}-metal" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>
      <linearGradient id="${token}-bright" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${shade}"/><stop offset=".26" stop-color="${mid}"/><stop offset=".52" stop-color="${light}"/><stop offset=".79" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <radialGradient id="${token}-gem" cx=".28" cy=".22" r=".8"><stop stop-color="#fff"/><stop offset=".31" stop-color="${light}"/><stop offset=".7" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
      <mask id="${token}-outside" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="470">
        <rect x="0" y="0" width="320" height="470" fill="#fff"/>
        <rect x="18" y="18" width="284" height="434" rx="15" fill="#000"/>
      </mask>
    </defs>
    <g mask="url(#${token}-outside)">
      <rect x="5.5" y="5.5" width="309" height="459" rx="22" stroke="${color}" stroke-opacity="${glowOpacity}" stroke-width="${cls>=8?10:7}" fill="none"/>
      <rect x="7" y="7" width="306" height="456" rx="21" stroke="url(#${token}-metal)" stroke-width="${width}" fill="none"/>
      <rect x="12" y="12" width="296" height="446" rx="18" stroke="url(#${token}-bright)" stroke-width=".85" stroke-opacity=".75" fill="none"/>
      <rect x="16.5" y="16.5" width="287" height="437" rx="15.5" stroke="${dark}" stroke-width="1.4" fill="none" opacity=".7"/>
      ${corners}${extras}
    </g>
  </svg>`;
}
