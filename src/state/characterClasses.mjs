const identity = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
export function characterClasses(character = {}) {
  const found=new Map();
  const visit=value=>{
    if(Array.isArray(value)) return value.forEach(visit);
    if(value && typeof value==='object') return visit(value.classes?.length?value.classes:value.title || value.name || value.className || value.slug || value.key);
    if(typeof value!=='string') return;
    value.split(/\s*[/,|+]\s*/).filter(Boolean).forEach(name=>{if(!found.has(identity(name)))found.set(identity(name),name.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()));});
  };
  for(const source of [character,character.character || {}]) for(const field of ['classInfo','classes','primaryClass','klass','class','classNames','secondaryClasses','classSlugs','primaryClassSlug','secondaryClassSlugs','classSlug','talentClasses','talentClass']) visit(source[field]);
  return [...found.values()];
}
