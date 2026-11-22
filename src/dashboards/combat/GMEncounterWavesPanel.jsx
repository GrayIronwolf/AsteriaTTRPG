import React from 'react';
import styles from './GMEncounterWavesPanel.module.css';

export function GMEncounterWavesPanel({
  combat,schedule=null,pending=null,busy=false,onCommand
}){
  const canTrigger=Boolean(combat?.isActive&&combat.sessionEditable&&!pending&&!busy);
  const waveRows=schedule?.waves||[];
  const eventRows=schedule?.events||[];
  const activate=(type,item)=>{
    const isWave=type==='wave';
    const subject=isWave?'Release '+item.enemies.length+' reinforcement enemies':
      'Trigger encounter event';
    const warning=isWave?
      'Existing turns, player characters and initiative/AP state are preserved.':
      'No HP, SP, MP, AP or condition changes occur automatically.';
    if(!window.confirm(subject+': '+item.name+'?\n'+warning))return;
    onCommand('encounter',isWave?{
      operation:'release-wave',waveId:item.id,confirmation:'release-wave'
    }:{
      operation:'trigger-event',eventId:item.id,confirmation:'trigger-event'
    });
  };
  return <section className={styles.panel} data-testid="site-gm-encounter-waves">
    <h3>Encounter Waves &amp; Events</h3>
    <p>Prepared encounter schedules remain GM-only. Round markers are reminders,
      not automatic triggers. Releasing a wave cannot interrupt an unresolved action.</p>
    {schedule?<p>Loaded template: {schedule.preparedId} · Revision
      {' '}{schedule.preparedRevision}</p>:
      <p>No prepared encounter schedule is loaded. Load a saved encounter
        with planned waves or events first.</p>}
    {schedule?<div className={styles.groups}>
      <section>
        <h4>Reinforcement Waves</h4>
        {waveRows.length?waveRows.map(wave=><article key={wave.id}>
          <strong>{wave.name}</strong>
          <span>Suggested round {wave.round} · {wave.enemies.length} enemies ·
            { ' '}{wave.status==='released'?'Released':'Ready'}
          </span>
          {wave.notes?<p>{wave.notes}</p>:null}
          <details><summary>Preview reinforcement roster</summary>
            <ul>{wave.enemies.map((enemy,index)=><li key={index}>
              {enemy.name} · HP {enemy.hp?.[1]??'—'}
              {enemy.spawn?' · Map spawn prepared':''}
            </li>)}</ul>
          </details>
          <button type="button" disabled={!canTrigger||wave.status!=='ready'}
            onClick={()=>activate('wave',wave)}>Release Wave</button>
        </article>):<p>No reinforcement waves prepared.</p>}
      </section>
      <section>
        <h4>Planned Events</h4>
        {eventRows.length?eventRows.map(event=><article key={event.id}>
          <strong>{event.name}</strong>
          <span>{event.type} · Suggested round {event.round} ·
            { ' '}{event.status==='triggered'?'Triggered':'Ready'}
          </span>
          {event.notes?<p>{event.notes}</p>:null}
          <span>{event.announce?'Announce title to players':
            'GM-private event'}</span>
          <button type="button" disabled={!canTrigger||event.status!=='ready'}
            onClick={()=>activate('event',event)}>Trigger Event</button>
        </article>):<p>No encounter events prepared.</p>}
      </section>
    </div>:null}
    {pending?<p role="status">Resolve the pending combat action before
      releasing a wave or triggering an event.</p>:null}
  </section>;
}
