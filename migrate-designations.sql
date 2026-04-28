-- Add designation column to holes
ALTER TABLE the2s_holes ADD COLUMN designation text CHECK (designation IN ('2x', 'iii', 'tips'));

-- Set hole 1 as 2x (from current config)
UPDATE the2s_holes SET designation = '2x' WHERE number = 1;

-- Randomly assign 2 holes as 'iii' (from undesignated)
UPDATE the2s_holes SET designation = 'iii'
WHERE number IN (
  SELECT number FROM the2s_holes WHERE designation IS NULL ORDER BY random() LIMIT 2
);

-- Randomly assign 2 holes as 'tips' (from remaining undesignated)
UPDATE the2s_holes SET designation = 'tips'
WHERE number IN (
  SELECT number FROM the2s_holes WHERE designation IS NULL ORDER BY random() LIMIT 2
);

-- Verify
SELECT number, par, handicap, designation FROM the2s_holes ORDER BY number;
