/**
 * Compare Firebase Rules without treating whitespace and comments as changes.
 *
 * Live Rules API source may contain extra blank lines or reformatted
 * indentation even when the deployed predicates are identical to source.
 * This conservative tokenizer keeps identifiers, numbers, punctuation,
 * operators and every quoted string intact. Unknown/malformed input fails
 * closed. We never normalize meaningful tokens or infer authorisation safety.
 */
const MAX_SOURCE_BYTES=1024*1024;
const space=c=>/\s/u.test(c);
const identStart=c=>/[a-zA-Z_$]/.test(c);
const identPart=c=>/[a-zA-Z0-9_$]/.test(c);
const digit=c=>/[0-9]/.test(c);

export function firebaseRulesTokens(source){
  if(typeof source!=='string'||source.length===0||
     source.length>MAX_SOURCE_BYTES)return null;
  const out=[];
  let i=0;
  while(i<source.length){
    const c=source[i],next=source[i+1];
    if(space(c)){i++;continue;}
    if(c==='/'&&next==='/'){
      i+=2;
      while(i<source.length&&source[i]!=='\n'&&source[i]!=='\r')i++;
      continue;
    }
    if(c==='/'&&next==='*'){
      const end=source.indexOf('*/',i+2);
      if(end<0)return null;
      i=end+2;
      continue;
    }
    if(c==="'"||c==='"'){
      let token=c,closed=false;
      const quote=c;
      i++;
      while(i<source.length){
        const ch=source[i++];
        if(ch==='\n'||ch==='\r')return null;
        token+=ch;
        if(ch==='\\'){
          if(i>=source.length)return null;
          token+=source[i++];
        }else if(ch===quote){closed=true;break;}
      }
      if(!closed)return null;
      out.push(token);
      continue;
    }
    if(identStart(c)){
      const start=i++;
      while(i<source.length&&identPart(source[i]))i++;
      out.push(source.slice(start,i));
      continue;
    }
    if(digit(c)){
      const start=i++;
      while(i<source.length&&digit(source[i]))i++;
      if(source[i]==='.'&&digit(source[i+1])){
        i++;
        while(i<source.length&&digit(source[i]))i++;
      }
      out.push(source.slice(start,i));
      continue;
    }
    // Operators and paths are split into individual significant symbols.
    // This is conservative: a changed operator or path always changes tokens.
    out.push(c);
    i++;
  }
  return out;
}
export function firebaseRulesParity(live,checkedIn){
  if(typeof live!=='string'||typeof checkedIn!=='string'||
     live.length===0||checkedIn.length===0)
    return 'DIFFERENT FROM SOURCE';
  if(live===checkedIn)return 'matches-checked-in-source';
  const a=firebaseRulesTokens(live),b=firebaseRulesTokens(checkedIn);
  if(!a||!b||a.length!==b.length)return 'DIFFERENT FROM SOURCE';
  for(let i=0;i<a.length;i++)
    if(a[i]!==b[i])return 'DIFFERENT FROM SOURCE';
  return 'matches-source-ignoring-formatting-and-comments';
}
