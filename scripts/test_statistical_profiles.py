import unittest

import numpy as np
import pandas as pd
from pandas.testing import assert_frame_equal

from statistical_profiles.fixture import fixture, TARGET
from statistical_profiles.methods import AXES, weights, standardized, principal_components, compare, ranks, vifs
from advanced_features.metrics import METRICS


class ProfilingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data, cls.ref, cls.cand = fixture()

    def test_fixture_cohorts_and_reproducibility(self):
        data,ref,cand = fixture()
        assert_frame_equal(self.data,data)
        self.assertEqual((len(ref),len(cand),len(set(ref)&set(cand))),(169,108,78))
        self.assertNotIn(TARGET,cand)
        self.assertEqual(set(data),{m.key for m in METRICS})
        self.assertTrue(all(i.startswith("SIM-") for i in data.index))

    def test_no_preprocessing_leakage(self):
        x = self.data[list(weights(AXES).index)]
        modified = x.copy()
        modified.loc["SIM-198"] *= 100
        for mode in ["standard","robust","log","winsor"]:
            a = standardized(x,self.ref,mode)
            b = standardized(modified,self.ref,mode)
            assert_frame_equal(a.loc[self.ref],b.loc[self.ref])
            eig,vec,_ = principal_components(a,self.ref)
            other_eig,other_vec,_ = principal_components(b,self.ref)
            np.testing.assert_allclose(eig,other_eig)
            np.testing.assert_allclose(vec,other_vec)

    def test_category_mass_and_partial_contributions(self):
        w = weights(AXES)
        for keys in AXES.values():
            self.assertAlmostEqual(w[list(keys)].sum(),1/7)
        d,parts,k = compare(self.data,self.ref,self.cand,TARGET)
        self.assertEqual(len(d),108)
        self.assertLess(k,len(w))
        np.testing.assert_allclose(parts.sum(axis=1),d.category_rms**2)
        self.assertTrue(np.isfinite(d).all().all())

    def test_duplicate_feature_cannot_increase_an_axis_weight(self):
        with self.assertRaises(ValueError):
            weights({"shooting":["shots90"],"other":["shots90"]})

    def test_angle_and_amplitude(self):
        x = pd.DataFrame({"a":[-1,0,1,2,0],"b":[-1,0,1,2,0]},
                         index=["low","mid","target","candidate","center"])
        ds,_,_ = compare(x,["low","mid","target"],["candidate","center"],"target",{"axis":["a","b"]})
        self.assertAlmostEqual(ds.loc["candidate","cosine_distance"],0)
        self.assertGreater(ds.loc["candidate","category_rms"],0)
        self.assertTrue(np.isnan(ds.loc["center","cosine_distance"]))

    def test_full_pc_geometry_and_truncation(self):
        z = standardized(self.data[list(weights(AXES).index)],self.ref)
        balanced = z*np.sqrt(weights(AXES))
        _,_,pc = principal_components(balanced,self.ref)
        projected = (pc-pc.loc[TARGET]).loc[self.cand]
        d,_,_ = compare(self.data,self.ref,self.cand,TARGET)
        np.testing.assert_allclose(np.linalg.norm(projected,axis=1),d.category_rms)
        self.assertTrue((d.pca_distance<=d.category_rms+1e-12).all())

    def test_economic_attributes_and_availability_have_no_influence(self):
        x = self.data.assign(age=10,market_value=123,minutes=0,starts=0)
        d,_,_ = compare(x,self.ref,self.cand,TARGET)
        other,_,_ = compare(self.data,self.ref,self.cand,TARGET)
        assert_frame_equal(d,other)

    def test_missing_and_degenerate_inputs(self):
        x = self.data.copy()
        x.loc["SIM-198","box90"] = np.nan
        d,_,_ = compare(x,self.ref,self.cand,TARGET)
        self.assertTrue(d.loc["SIM-198"].isna().all())
        self.assertEqual(ranks(d.category_rms,d.standard_rms)["common_n"],107)
        x.loc[TARGET,"box90"] = np.nan
        with self.assertRaises(ValueError):
            compare(x,self.ref,self.cand,TARGET)
        with self.assertRaises(ValueError):
            standardized(self.data.assign(box90=1),self.ref)

    def test_exact_redundancy(self):
        x = self.data.loc[self.ref,["npg90","npxg90","finishing90"]]
        self.assertTrue(np.isinf(vifs(x)).all())


if __name__=="__main__":
    unittest.main()
