import json
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent


class ReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.a=json.loads((HERE/'wyscout-salah-2017-18.v1.json').read_text())
        cls.rows=cls.a['profiles']

    def test_population(self):
        self.assertEqual(len({r['id'] for r in self.rows}),152)
        unranked=[r for r in self.rows if r['ranks'] is None]
        self.assertEqual({r['name'] for r in unranked},{'R. Sterling','Mohamed Salah'})
        sterling=next(r for r in unranked if r['name']=='R. Sterling')
        self.assertIsNone(sterling['values']['npg90'])
        self.assertIsNone(sterling['percentiles']['npg90'])

    def test_display_contract(self):
        keys={m['key'] for m in self.a['metrics']}
        for r in self.rows:
            self.assertEqual(set(r['values']),keys)
            self.assertTrue(r['clubs'] and r['minutes']>=1200 and r['wideShare']>=.6)
            if r['scores']:
                self.assertEqual(set(r['ranks']),set(self.a['methods']))
                self.assertAlmostEqual(r['scores']['category']**2,sum(r['squaredContributions'].values()),places=6)

    def test_only_licensed_inputs(self):
        self.assertEqual(len(self.a['attribution']['sources']),7)
        for s in self.a['attribution']['sources']:
            self.assertTrue(s['url'].startswith('https://figshare.com/'))
        allowed={'id','name','clubs','minutes','starts','wideActions','attackingHalfActions','wideShare','values','percentiles','ranks','scores','squaredContributions','videoQuestion'}
        self.assertTrue(all(set(r)<=allowed for r in self.rows))

    def test_common_baselines(self):
        self.assertEqual(len(self.a['benchmark']),15)
        self.assertTrue(all(s['common']==150 for s in self.a['benchmark'].values()))
