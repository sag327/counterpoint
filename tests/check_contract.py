"""Run from any directory with Python 3 and jsonschema installed."""
import json
from pathlib import Path
from jsonschema import Draft7Validator

root = Path(__file__).resolve().parents[1]
fixtures = root / 'tests/fixtures/v1'
def read(path):
    return json.loads(path.read_text())
def validator(kind):
    schema = read(root / 'contracts' / (kind + '.v1.schema.json'))
    Draft7Validator.check_schema(schema)
    return Draft7Validator(schema)
world = read(fixtures / 'ring.json')
validator('world').validate(world)
assert [n['erpMs'] for n in world['nodes']] == [180,300,220,220,220,220,220,200]
for i, link in enumerate(world['links']):
    assert (link['id'],link['a'],link['b']) == (f'L{i}',f'R{i}',f'R{(i+1)%8}')
    assert all(link[k]['delayMs'] == 60 for k in ('ab','ba'))
event_schema, cmd_schema = validator('event'), validator('command')
validator('noteIntent')
for case, count, last in [('A',8,240), ('B',25,1200), ('C',28,1380)]:
    commands = read(fixtures / f'{case}.commands.json')
    for cmd in commands:
        cmd_schema.validate(cmd)
    stream = read(fixtures / f'{case}.presentation.json')
    events = stream['events']
    assert stream['origin'] == 'analytic-test-only'
    assert [e['tMs'] for e in events] == sorted(e['tMs'] for e in events)
    seen, active, captures = {}, {}, []
    for i,e in enumerate(events,1):
        event_schema.validate(e)
        assert e['seq']==i and e['eventId']==f'e{i}'
        assert e['runId']==commands[0]['runId'] and e['worldId']==world['worldId']
        assert e['tMs'] <= stream['throughMs']
        typ=e['type']
        if typ in ('activation','activation_blocked'):
            assert all(seen[id]['nodeId']==e['nodeId'] and seen[id]['tMs']==e['tMs'] for id in e['causeIds'])
        if typ=='activation':
            captures.append((e['tMs'],e['nodeId']))
        if typ=='conduction_launched':
            assert seen[e['activationId']]['nodeId']==e['fromNodeId']
            active[e['transitId']]=e
        if typ=='conduction_arrived':
            launched=active.pop(e['transitId'])
            assert (e['nodeId'],e['tMs'],e['linkId'])==(launched['toNodeId'],launched['arrivalMs'],launched['linkId'])
        seen[e['eventId']]=e
    assert [(e['tMs'],e['triggerId'],e['nodeId']) for e in events if e['type']=='stimulus_attempted'] == [
        (cmd['tMs'],cmd['commandId'],cmd['nodeId']) for cmd in commands if cmd['type']=='stimulate']
    assert [(e['tMs'],e['commandId'],e['linkId'],e['value']) for e in events if e['type']=='link_changed'] == [
        (cmd['tMs'],cmd['commandId'],cmd['linkId'],cmd['enabled']) for cmd in commands if cmd['type']=='setLinkEnabled']
    assert len(captures)==count and captures[-1][0]==last
    if case=='A':
        assert not active
    else:
        assert [n for t,n in captures if t==300]==['R7']
        blocked=[e for e in events if e['type']=='activation_blocked']
        assert [(e['tMs'],e['nodeId'],e['remainingErpMs']) for e in blocked]==[(300,'R1',60)]
        assert (720,'R0') in captures and (1200,'R0') in captures
    if case=='C':
        assert not active and captures[-1]==(1380,'R5')
        assert [(e['tMs'],e['value']) for e in events if e['type']=='link_changed']==[(1000,False),(1500,True)]
    print(f'{case}: {len(events)} events, {count} captures, last capture at {last} ms')
