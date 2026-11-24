import unittest
from storage_cors_plan import merge

class CorsPlanTests(unittest.TestCase):
    def setUp(self):
        self.rule = {"origin":["https://asteriattrpg.com"],"method":["GET","HEAD"],"maxAgeSeconds":3600}
    def test_empty(self):
        self.assertEqual(merge([], [self.rule]), [self.rule])
    def test_preserve(self):
        other = {"origin":["https://other.example"],"method":["GET"]}
        self.assertEqual(merge([other], [self.rule]), [other,self.rule])
    def test_idempotent(self):
        self.assertEqual(merge([self.rule], [self.rule]), [self.rule])
    def test_reject_wildcard(self):
        with self.assertRaises(ValueError):
            merge([], [{**self.rule,"origin":["*"]}])
    def test_reject_writes(self):
        with self.assertRaises(ValueError):
            merge([], [{**self.rule,"method":["GET","PUT"]}])
    def test_reject_invalid_existing(self):
        with self.assertRaises(ValueError):
            merge({}, [self.rule])

if __name__ == "__main__":
    unittest.main()
