import React from 'react';

/** Inline editors reuse the campaign Library form; no separate page/state. */
const groups=[
  {key:'attacks',label:'Attacks',fields:['name','description','damage','range','ap','sp']},
  {key:'spells',label:'Spells',fields:['name','rank','description','range','ap','mp','requirement']},
  {key:'abilities',label:'Abilities & Conditions',fields:['name','category','effect','description','ap','mp','sp']},
  {key:'equipment',label:'Equipment',fields:['name','category','description','charges']},
  {key:'resistances',label:'Resistances',fields:['name','description']},
  {key:'immunities',label:'Immunities',fields:['name','description']}
];
const numeric=new Set(['ap','sp','mp','charges']);
const id=()=> 'profile-'+crypto.randomUUID().replaceAll('-','').slice(0,20);
function EntryList({group,entries=[],onChange,disabled}){
  const update=(index,field,value)=>onChange(entries.map((row,i)=>i===index?
    {...row,[field]:numeric.has(field)?(value===''?undefined:Number(value)):value}:row));
  return <div className="react-gm-library-fields">
    {(Array.isArray(entries)?entries:[]).map((row,index)=>
      <fieldset key={row.id||index}>
        <legend>{group.label} {index+1}</legend>
        {group.fields.map(field=><label key={field}>
          {field.charAt(0).toUpperCase()+field.slice(1)}
          {field==='description'||field==='effect'?
            <textarea rows={2} maxLength={500} value={row[field]??''}
              disabled={disabled} onChange={event=>update(index,field,event.target.value)}/>:
            <input type={numeric.has(field)?'number':'text'}
              min={numeric.has(field)?0:undefined}
              max={field==='ap'?3:numeric.has(field)?1000000:undefined}
              maxLength={numeric.has(field)?undefined:500}
              value={row[field]??''} disabled={disabled}
              onChange={event=>update(index,field,event.target.value)}/>}
        </label>)}
        <button type="button" disabled={disabled}
          onClick={()=>onChange(entries.filter((_,i)=>i!==index))}>
          Remove {group.label.toLowerCase()} entry
        </button>
      </fieldset>)}
    <button type="button" disabled={disabled||entries.length>=32}
      onClick={()=>onChange([...entries,{id:id(),name:''}])}>
      Add {group.label.toLowerCase()} entry
    </button>
  </div>;
}
export function CreatureProfileEditor({draft,setField,disabled=false}){
  const characteristicNames=['str','dex','agi','con','end','int','wis','cha','luck'];
  return <>
    <details className="react-gm-library-stats">
      <summary>Characteristics, NAC &amp; Portrait</summary>
      <div className="react-gm-library-fields">
        <label>Portrait reference URL (optional)
          <input type="text" maxLength={1000} value={draft.portrait||''}
            disabled={disabled} onChange={event=>setField('portrait',event.target.value)}/>
        </label>
        <label>Natural Armour Class (NAC)
          <input type="number" min="0" max="1000" value={draft.nac??''}
            disabled={disabled}
            onChange={event=>setField('nac',event.target.value===''?undefined:Number(event.target.value))}/>
        </label>
        {characteristicNames.map(name=><label key={name}>{name.toUpperCase()}
          <input type="number" min="0" max="1000"
            value={draft.characteristics?.[name]??''} disabled={disabled}
            onChange={event=>setField('characteristics',{
              ...(draft.characteristics||{}),
              [name]:event.target.value===''?undefined:Number(event.target.value)
            })}/>
        </label>)}
      </div>
    </details>
    {groups.map(group=><details key={group.key} className="react-gm-library-stats">
      <summary>{group.label} ({draft[group.key]?.length||0})</summary>
      <EntryList group={group} entries={draft[group.key]||[]}
        onChange={value=>setField(group.key,value)} disabled={disabled}/>
    </details>)}
  </>;
}
