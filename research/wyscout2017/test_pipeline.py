import unittest
from collections import Counter
from pipeline import count_event, intervals


class WyscoutTests(unittest.TestCase):
    def test_shots_penalties_and_own_goals(self):
        c = Counter()
        for sub,tags in [(100,{101}), (35,{101}), (33,{1201}), (100,{102}), (100,{1217})]:
            count_event(c,dict(eventId=10 if sub==100 else 3,subEventId=sub,positions=[]),tags)
        self.assertEqual((c['goals'], c['npg'], c['np_shots'], c['sot']), (2,1,3,3))

    def test_progress_and_wide_evidence(self):
        c = Counter()
        e = dict(eventId=8,subEventId=85,positions=[dict(x=50,y=70),dict(x=60,y=50)])
        for tags in [{1801,302},{1802}]:
            count_event(c,e,tags)
        self.assertEqual((c['passes'],c['completed'],c['progressive'],c['wide'],c['key_passes']),(2,1,1,2,1))

    def test_substitution_and_dismissal(self):
        f = dict(lineup=[dict(playerId=1)],bench=[dict(playerId=2)],substitutions=[dict(playerOut=1,playerIn=2,minute=60)])
        durations,issues=intervals(f,{2:74})
        self.assertEqual(durations,{1:(60,1),2:(14,0)})
        self.assertFalse(issues)

    def test_null_substitutions_flag_exposure(self):
        _,issues=intervals(dict(lineup=[dict(playerId=1)],bench=[],substitutions='null'),{})
        self.assertEqual(issues,{1})

    def test_scoring_corner_and_keeper_mirror(self):
        c = Counter()
        for family,sub in [(3,30),(9,91)]:
            count_event(c,dict(eventId=family,subEventId=sub,positions=[]),{101})
        self.assertEqual((c['goals'],c['npg'],c['sot']),(1,1,1))

    def test_formation_red_card_minute(self):
        f=dict(lineup=[dict(playerId=1,redCards='87')],bench=[],substitutions=[])
        self.assertEqual(intervals(f,{}),({1:(87,1)},set()))
