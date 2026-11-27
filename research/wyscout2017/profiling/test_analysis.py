import unittest
import pandas as pd
import numpy as np
from analyze import SOURCE, TARGET, F, cohort, fit, agreement


class ProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ref=cohort(pd.read_csv(SOURCE).set_index('player_id'))

    def test_population(self):
        self.assertEqual(len(self.ref),152)
        self.assertEqual(len(self.ref.dropna(subset=F)),151)
        self.assertEqual(self.ref.loc[self.ref.npg90.isna(),'name'].tolist(),['R. Sterling'])

    def test_distance_and_identity(self):
        scores,parts,*_=fit(self.ref)
        self.assertEqual(len(scores),150)
        self.assertNotIn(TARGET,scores.index)
        np.testing.assert_allclose(parts.loc[scores.index].sum(axis=1),scores.category**2)
        z=self.ref.dropna(subset=F)[F]
        z=(z-z.mean())/z.std(ddof=0)
        delta=(z-z.loc[TARGET])**2
        expected=(delta.sum(axis=1)-.5*(delta.np_shots90+delta.sot90))/6
        np.testing.assert_allclose(expected.loc[scores.index],scores.category**2)
        self.assertTrue(np.isfinite(scores.to_numpy()).all())

    def test_shared_vs_unrestricted_overlap(self):
        a=pd.Series(range(12),index=range(12))
        b=pd.concat([pd.Series([-1],index=[99]),a])
        result=agreement(a,b)
        self.assertEqual((result['common'],result['shared5'],result['common_shared5']),(12,4,5))

    def test_pca_and_cosine(self):
        scores,_,v,vt,pcs,k=fit(self.ref)
        self.assertTrue((scores.cosine.between(0,2)).all())
        self.assertLess(v[:k-1].sum(),.85)
        self.assertGreaterEqual(v[:k].sum(),.85)
        np.testing.assert_allclose(vt@vt.T,np.eye(len(F)),atol=1e-10)
