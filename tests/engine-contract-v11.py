"""Validate actual contract 1.1.0 engine receipts against the 1.1.0 wire schemas and causal rules."""
import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator

ROOT = Path(__file__).resolve().parents[1]


def validator(name):
    schema = json.loads((ROOT / 'contracts' / f'{name}.v1_1.schema.json').read_text())
    Draft7Validator.check_schema(schema)
    return Draft7Validator(schema)


def ticks(ms):
    return round(ms * 1000)


def check(evidence_path):
    evidence = json.loads(Path(evidence_path).read_text())
    assert evidence['origin'] == 'actual-headless-engine' and evidence['contract'] == '1.1.0'
    world_validator, command_validator, event_validator = validator('world'), validator('command'), validator('event')
    seen_types = set()
    for name, trace in evidence['traces'].items():
        world_validator.validate(trace['world'])
        assert trace['world']['contractVersion'] == '1.1.0'
        trains = {}
        for command in trace['commands']:
            command_validator.validate(command)
            if command['type'] == 'stimulateTrain':
                trains[command['commandId']] = command
        run_id = trace['runId']
        prior_time = 0
        seen = {}
        live = {}
        closed = set()
        for seq, event in enumerate(trace['events'], 1):
            event_validator.validate(event)
            kind = event['type']
            seen_types.add(kind)
            assert event['seq'] == seq and event['eventId'] == f'e{seq}'
            assert event['runId'] == run_id and event['worldId'] == trace['world']['worldId']
            assert prior_time <= event['tMs'] <= trace['throughMs']
            prior_time = event['tMs']
            if kind in ('activation', 'activation_blocked'):
                assert all(seen[cause]['tMs'] == event['tMs'] and seen[cause]['nodeId'] == event['nodeId'] for cause in event['causeIds'])
            if kind == 'activation':
                assert 'diastolicIntervalMs' in event, 'every 1.1.0 activation reports its diastolic interval'
                assert (event['diastolicIntervalMs'] is None) == (event['priorActivationMs'] is None)
            elif kind == 'stimulus_attempted' and '#' in event['triggerId']:
                train_id, index = event['triggerId'].rsplit('#', 1)
                train = trains[train_id]
                assert event['nodeId'] == train['nodeId']
                assert ticks(event['tMs']) == ticks(train['startMs']) + (int(index) - 1) * ticks(train['cycleMs'])
            elif kind == 'train_completed':
                train = trains[event['commandId']]
                assert event['trainId'] == event['commandId'] and event['count'] == train['count']
                pulses = sum(1 for e in seen.values() if e['type'] == 'stimulus_attempted' and e['triggerId'].rsplit('#', 1)[0] == event['trainId'])
                assert event['delivered'] == pulses, 'delivered counts the pulses actually emitted'
                assert (event['delivered'] < event['count']) if event['cancelled'] else (event['delivered'] == event['count'])
                assert event['trainId'] not in closed, 'a train closes at most once'
                closed.add(event['trainId'])
            elif kind == 'conduction_launched':
                activation = seen[event['activationId']]
                assert activation['type'] == 'activation' and activation['nodeId'] == event['fromNodeId']
                assert activation['tMs'] == event['departureMs'] < event['arrivalMs']
                parts = event['delayParts']
                assert ticks(event['arrivalMs']) - ticks(event['departureMs']) == sum(ticks(value) for value in parts.values())
                live[event['transitId']] = event
            elif kind in ('conduction_arrived', 'conduction_canceled', 'conduction_collision'):
                for transit_id in event['transitIds'] if kind == 'conduction_collision' else [event['transitId']]:
                    transit = live.pop(transit_id)
                    assert transit['linkId'] == event['linkId']
                    assert transit['departureMs'] <= event['tMs'] <= transit['arrivalMs']
                    if kind == 'conduction_arrived':
                        assert event['nodeId'] == transit['toNodeId'] and event['tMs'] == transit['arrivalMs']
            elif kind == 'phase_modulated':
                source = seen[event['sourceActivationId']]
                assert source['type'] == 'activation' and source['tMs'] == event['tMs']
                assert event['nextAttemptMs'] > event['tMs']
            elif kind in ('parameter_changed', 'link_changed'):
                assert event['cause'] in ('command', 'lesion', 'agent')
                assert any(command['commandId'] == event['commandId'] for command in trace['commands'])
            seen[event['eventId']] = event
        print(f'{name}: {len(trace["events"])} actual 1.1.0 events verified, {len(live)} transits live at horizon')
    required = {'phase_modulated', 'lesion_changed', 'train_completed', 'parameter_changed', 'link_changed', 'conduction_canceled', 'activation_blocked'}
    assert required <= seen_types, required - seen_types
    closes = [e for t in evidence['traces'].values() for e in t['events'] if e['type'] == 'train_completed']
    assert any(e['cancelled'] for e in closes) and any(not e['cancelled'] for e in closes)
    assert any(e['cancelled'] and e['delivered'] == 0 for e in closes), 'a train cancelled before its first pulse closes with delivered 0'
    params = {e['parameter'] for t in evidence['traces'].values() for e in t['events'] if e['type'] == 'parameter_changed'}
    assert {'autonomic', 'protected', 'tone', 'restitution', 'erpMs'} <= params, params
    sweep = {round(row['amplitude'], 4): row['bBeats'] for row in evidence['couplingSweep']}
    assert all(sweep[round(k / 200, 4)] == 280 for k in range(31, 42)), 'Duality locks 2:3 for a in 0.155..0.205'
    assert all(sweep[a] == 315 for a in (0.21, 0.215, 0.22)), 'Duality locks 3:4 for a in 0.21..0.22'
    assert sweep[0.1825] == sweep[0.184] == 300, 'narrow 5:7 window'
    print(f'coupling sweep: {len(sweep)} amplitudes verified')


if __name__ == '__main__':
    check(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'evidence' / 'engine-v11-02.json')
