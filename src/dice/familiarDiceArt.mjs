/**
 * Pure, deterministic Familiar Dice artwork. The image is painted INTO Open
 * Dice's existing PBR face albedo, not placed over the number or roll result.
 * All inputs are validated by validateDiceAppearance before reaching this file.
 * SVG is locally generated; no remote image upload, tracking or credentials.
 */
export const FAMILIAR_COAT_COLORS=Object.freeze([
  '#111925','#F2F3EE','#9C7047','#C27B31','#61412F','#D3DDE4',
  '#757E92','#E2BE86','#E59B64','#7D5262','#C8B7A5','#304557'
]);
export const FAMILIAR_EYE_COLORS=Object.freeze([
  '#D5B36A','#247858','#295EA8','#43AEC2',
  '#7947B2','#C27B31','#E9B869','#9C7047'
]);
export const FAMILIAR_PAW_COLORS=Object.freeze([
  '#111925','#304557','#D3DDE4','#D5B36A','#9C7047','#F2F3EE',
  '#AE3241','#295EA8','#247858','#7947B2','#C982A5','#61412F'
]);
export const FAMILIAR_NUMBER_COLORS=Object.freeze([
  '#D5B36A','#F2F3EE','#111925','#304557','#D3DDE4','#9C7047',
  '#E9B869','#295EA8','#AE3241','#247858','#7947B2','#B0E7EF'
]);
export const FAMILIAR_DECORATIONS=Object.freeze([
  'paw','star','moon','fish','bell','ribbon','whiskers',
  'yarn','flower','heart','sparkle','none'
]);

// Eight distinct, original cat silhouette poses. Coordinates are local
// 100x100 design-space, so the motif can be repeated without changing physics.
export const CAT_POSE_ART=Object.freeze({
  sitting:Object.freeze({
    silhouette:'M25 77 Q18 56 30 43 L31 29 L41 8 L50 27 L61 9 L72 31 L68 46 Q82 63 74 81 Q63 93 45 89 Q34 88 25 77 Z M72 70 Q98 49 96 77 Q94 95 70 91 Z',
    eyes:[[43,40],[58,40]]
  }),
  curled:Object.freeze({
    silhouette:'M13 63 Q19 38 44 38 L42 26 L50 14 L57 28 L72 15 L75 36 Q91 40 91 62 Q87 89 54 90 Q21 93 13 63 Z M23 66 Q39 77 59 69 Q79 59 77 77 Q66 90 48 83',
    eyes:[[57,45],[68,44]]
  }),
  stretching:Object.freeze({
    silhouette:'M12 47 L15 32 L27 43 Q39 41 58 46 Q68 51 73 39 L81 20 L87 19 L91 40 Q88 56 75 62 L68 82 L60 82 L59 64 L32 64 L27 83 L19 83 L19 62 Q13 57 12 47 Z M18 40 L17 27 L26 37 Z',
    eyes:[[21,50],[27,49]]
  }),
  walking:Object.freeze({
    silhouette:'M13 51 L15 38 L25 48 Q39 41 64 44 L74 40 L77 26 L84 37 L91 33 L92 52 L84 60 L75 60 L73 83 L66 83 L62 61 L41 64 L36 83 L29 83 L29 61 L19 64 Z M15 49 Q5 36 8 24',
    eyes:[[80,47],[87,47]]
  }),
  pouncing:Object.freeze({
    silhouette:'M10 52 Q23 36 40 42 L51 46 L68 25 L72 15 L80 20 L85 13 L91 32 L79 44 L97 56 L94 63 L72 55 L51 62 L37 84 L30 83 L38 58 L16 67 L7 66 Z M14 50 Q5 43 6 25',
    eyes:[[78,31],[86,29]]
  }),
  alert:Object.freeze({
    silhouette:'M22 85 Q20 59 31 47 L30 28 L42 10 L51 28 L62 10 L72 29 L72 45 Q82 64 78 86 L66 87 L62 62 L53 75 L51 88 L37 88 L35 64 L33 87 Z M74 77 Q102 40 95 72 Q92 90 74 90 Z',
    eyes:[[44,40],[58,40]]
  }),
  perched:Object.freeze({
    silhouette:'M25 71 Q22 47 34 42 L32 26 L42 10 L52 29 L64 12 L73 30 L69 44 Q80 55 80 69 Q73 85 42 81 L28 89 L20 84 Z M66 69 Q92 50 92 66 Q91 93 68 91 Z',
    eyes:[[46,41],[59,41]]
  }),
  portrait:Object.freeze({
    silhouette:'M14 72 L18 32 L35 8 L50 28 L65 7 L84 33 L90 73 Q77 90 53 91 Q28 90 14 72 Z',
    eyes:[[37,52],[64,52]]
  })
});

function patternMarkup(kind){
  // Keep every marking inside the silhouette clip. These produce visibly
  // different coat patterns, including the two-colour variants.
  switch(kind){
    case 'tabby':return '<path d="M8 16L44 52 M24 7L57 40 M49 1L81 35 M-5 42L40 86 M38 61L79 99 M66 50L102 84" fill="none" stroke="#45301D" stroke-width="9" opacity=".72"/>';
    case 'tuxedo':return '<path d="M42 40Q54 56 71 39L67 94L37 94Z" fill="#F7F0E5" opacity=".95"/>';
    case 'calico':return '<path d="M5 20Q25 5 44 26L36 59L5 61Z" fill="#D99750"/><path d="M56 3Q81 13 93 34L67 57L51 39Z" fill="#27282B"/><path d="M16 68Q45 48 48 92L13 103Z" fill="#F8ECD8"/>';
    case 'tortoiseshell':return '<path d="M4 21Q34 10 44 37L21 62L3 50Z M59 11Q99 30 79 60L52 42Z M14 66Q38 58 61 84L30 106Z" fill="#C67A3D"/><path d="M39 18Q57 8 68 29L47 54Z M56 57Q88 50 94 86L61 94Z" fill="#3A2721"/>';
    case 'spotted':return '<g fill="#42352E" opacity=".84"><circle cx="31" cy="23" r="8"/><circle cx="60" cy="29" r="6"/><circle cx="19" cy="62" r="9"/><circle cx="51" cy="72" r="7"/><circle cx="78" cy="74" r="8"/></g>';
    case 'colourpoint':return '<path d="M15 8L88 8L75 56L23 57Z" fill="#42322F" opacity=".77"/><path d="M20 73L40 62L38 100L13 100Z M67 66L95 63L96 100L68 100Z" fill="#42322F" opacity=".8"/>';
    case 'bicolour':return '<path d="M42 -3H101V103H49Q36 62 42 -3Z" fill="#F8F0E1" opacity=".92"/>';
    default:return '';
  }
}
function decoratedPaw(x,y,scale,colour){
  return '<g transform="translate('+x+' '+y+') scale('+scale+')" fill="'+colour+'">'+
    '<path d="M0 18Q-16 13-12 3Q-8-4 0 1Q8-4 12 3Q16 13 0 18Z"/>'+
    '<ellipse cx="-17" cy="-5" rx="5" ry="7"/><ellipse cx="-6" cy="-12" rx="5" ry="7"/>'+
    '<ellipse cx="7" cy="-12" rx="5" ry="7"/><ellipse cx="18" cy="-5" rx="5" ry="7"/></g>';
}
function decorationMarkup(icon,colour){
  switch(icon){
    case 'none':return '';
    case 'moon':return '<path d="M202 21A17 17 0 1 0 218 49A18 18 0 1 1 202 21Z" fill="'+colour+'"/>';
    case 'star':return '<path d="M210 21L215 35L230 35L218 44L223 58L210 49L197 58L202 44L190 35L205 35Z" fill="'+colour+'"/>';
    case 'fish':return '<path d="M194 34Q212 19 227 34L238 24V46L227 37Q213 53 194 34Z" fill="'+colour+'"/>';
    case 'bell':return '<path d="M201 24Q219 14 222 37L227 47H195L200 38Z" fill="'+colour+'"/><circle cx="211" cy="51" r="4" fill="'+colour+'"/>';
    case 'ribbon':return '<path d="M211 38L192 22L192 53Z M211 38L231 22L231 53Z" fill="'+colour+'"/><circle cx="211" cy="38" r="6" fill="'+colour+'"/>';
    case 'whiskers':return '<path d="M194 35L222 43M196 45L223 39M200 53L225 35" stroke="'+colour+'" stroke-width="3" fill="none"/>';
    case 'yarn':return '<circle cx="211" cy="37" r="16" fill="none" stroke="'+colour+'" stroke-width="3"/><path d="M199 26L221 49M195 38L223 36M203 21L213 53" stroke="'+colour+'" fill="none" stroke-width="2"/>';
    case 'flower':return '<g fill="'+colour+'"><circle cx="201" cy="29" r="8"/><circle cx="221" cy="29" r="8"/><circle cx="211" cy="18" r="8"/><circle cx="211" cy="39" r="8"/><circle cx="211" cy="29" r="6" fill="#F9E1A5"/></g>';
    case 'heart':return '<path d="M211 49Q185 35 198 24Q207 17 211 27Q219 16 228 24Q240 35 211 49Z" fill="'+colour+'"/>';
    case 'sparkle':return '<path d="M212 17L217 33L233 38L217 43L212 59L207 43L191 38L207 33Z" fill="'+colour+'"/>';
    default:return decoratedPaw(210,34,.76,colour);
  }
}
function catMotif(config,x,y,scale,opacity){
  const pose=CAT_POSE_ART[config.pose];
  const eyes=pose.eyes.map(([ex,ey])=>'<ellipse cx="'+ex+'" cy="'+ey+
    '" rx="2.6" ry="3.7" fill="'+config.eyeColor+
    '"/><ellipse cx="'+ex+'" cy="'+ey+'" rx=".75" ry="2.6" fill="#141620"/>').join('');
  return '<g transform="translate('+x+' '+y+') scale('+scale+
    ')" opacity="'+opacity+'">'+
    '<defs><clipPath id="fur-'+x+'"><path d="'+pose.silhouette+'"/></clipPath></defs>'+
    '<path d="'+pose.silhouette+'" fill="'+config.coatColor+
    '" stroke="#423A38" stroke-width="1.3" stroke-linejoin="round"/>'+
    '<g clip-path="url(#fur-'+x+')">'+patternMarkup(config.coatPattern)+'</g>'+
    '<g>'+eyes+'</g></g>';
}
/** A stable data URL: one shared self-contained asset per complete style. */
export function familiarArtworkSvg(special,numberColor){
  const c=special;
  const resin=c.resinColor;
  // All characters interpolated from a fixed enum or strict HEX colour.
  return '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">'+
    '<defs><radialGradient id="resin" cx=".31" cy=".22" r=".97">'+
    '<stop offset="0" stop-color="#FFFFFF" stop-opacity=".58"/>'+
    '<stop offset=".36" stop-color="'+resin+'" stop-opacity=".21"/>'+
    '<stop offset="1" stop-color="'+resin+'" stop-opacity=".97"/></radialGradient></defs>'+
    '<rect width="256" height="256" fill="'+resin+'"/>'+
    '<rect width="256" height="256" fill="url(#resin)"/>'+
    '<g fill="#FFFFFF" opacity=".26"><circle cx="40" cy="120" r="3"/>'+
    '<circle cx="189" cy="129" r="2"/><circle cx="156" cy="49" r="4"/>'+
    '<circle cx="218" cy="195" r="2.5"/></g>'+
    catMotif(c,24,19,.72,.78)+catMotif(c,157,164,.65,.74)+
    decoratedPaw(38,210,.63,c.pawColor)+decoratedPaw(202,97,.51,c.pawColor)+
    decorationMarkup(c.decoration||'paw',c.pawColor)+
    '<path d="M15 127Q8 38 74 10" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".28"/>'+
    '<path d="M240 128Q242 196 185 239" fill="none" stroke="'+numberColor+
    '" stroke-width="1.5" opacity=".22"/></svg>';
}
export function familiarArtworkDataUrl(special,numberColor){
  return 'data:image/svg+xml;charset=utf-8,'+
    encodeURIComponent(familiarArtworkSvg(special,numberColor));
}
