"""Validate actual, reproducible engine receipts against the frozen v1 wire schemas."""
import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator

ROOT = Path(__file__).resolve().parents[1]


def validator(name):
    return Draft7Validator(json.loads((ROOT / 'contracts' / f'{name}.v1.schema.json').read_text()))


evidence_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'evidence' / 'engine-01.json'
evidence = json.loads(evidence_path.read_text())
assert evidence['origin'] == 'actual-headless-engine'
world_validator = validator('world')
command_validator = validator('command')
event_validator = validator('event')

for name, trace in evidence['traces'].items():
    world_validator.validate(trace['world'])
    for command in trace['commands']:
        command_validator.validate(command)
    run_id = trace['runId'] if 'runId' in trace else trace['commands'][0]['runId']
    events = trace['events']
    prior_time = 0
    seen = {}
    live = {}
    for seq, event in enumerate(events, 1):
        event_validator.validate(event)
        event_id = event['eventId']
        kind = event['type']
        assert event['seq'] == seq and event_id == f'e{seq}'
        assert event['runId'] == run_id and event['worldId'] == trace['world']['worldId']
        assert prior_time <= event['tMs'] <= trace['throughMs']
        prior_time = event['tMs']
        if kind in ['activation', 'activation_blocked']:
            assert all(seen[cause]['tMs'] == event['tMs'] and seen[cause]['nodeId'] == event['nodeId']
                       for cause in event['causeIds'])
        elif kind == 'conduction_launched':
            activation = seen[event['activationId']]
            assert activation['type'] == 'activation' and activation['nodeId'] == event['fromNodeId']
            assert activation['tMs'] == event['departureMs'] < event['arrivalMs']
            live[event['transitId']] = event
        elif kind in ['conduction_arrived', 'conduction_canceled', 'conduction_collision']:
            transit_ids = event['transitIds'] if kind == 'conduction_collision' else [event['transitId']]
            for transit_id in transit_ids:
                transit = live.pop(transit_id)
                assert transit['linkId'] == event['linkId']
                assert transit['departureMs'] <= event['tMs'] <= transit['arrivalMs']
                if kind == 'conduction_arrived':
                    assert event['nodeId'] == transit['toNodeId'] and event['tMs'] == transit['arrivalMs']
        seen[event_id] = event
    print(f'{name}: {len(events)} actual events verified, {len(live)} transits live at horizon')
