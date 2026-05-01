import styles from './Rules.module.css'
import { useData } from '../contexts/DataContext'
import { getDoubleHole } from '../lib/scoring'

export function Rules() {
  const { holes } = useData()
  const doubleHoleNum = getDoubleHole(holes)

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Scoring Rules</h2>

      <section className={styles.section}>
        <h3>Modified Stableford</h3>
        <p>Each player earns points on every hole based on their <strong>net score</strong> (gross score adjusted for handicap strokes).</p>
        <table className={styles.table}>
          <thead>
            <tr><th>Net Score</th><th>Points</th></tr>
          </thead>
          <tbody>
            <tr><td>Net Eagle (−2)</td><td>4</td></tr>
            <tr><td>Net Birdie (−1)</td><td>3</td></tr>
            <tr><td>Net Par (0)</td><td>2</td></tr>
            <tr><td>Net Bogey (+1)</td><td>1</td></tr>
            <tr><td>Net Double Bogey+</td><td>0</td></tr>
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h3>Handicap Strokes (Pops)</h3>
        <p>Each player receives strokes based on their <strong>pops</strong> number:</p>
        <ul>
          <li><strong>Pops 1–18:</strong> Receive 1 stroke on the N hardest holes</li>
          <li><strong>Pops 19–36:</strong> Receive 2 strokes on the hardest (pops − 18) holes, and 1 stroke on the remaining holes</li>
        </ul>
        <p>Hole difficulty is set by the <strong>hole handicap</strong> (1 = hardest, 18 = easiest).</p>
        <p>A green dot <span className={styles.dot}>●</span> means you get 1 stroke. Two dots <span className={styles.dot}>●●</span> means 2 strokes.</p>
      </section>

      <section className={styles.section}>
        <h3>Double Points Hole</h3>
        <p>
          {doubleHoleNum > 0
            ? <>Hole <strong>{doubleHoleNum}</strong> is the double points hole.</>
            : <>One hole will be designated as the double points hole.</>
          }
          {' '}Any points earned on that hole are <span className={styles.gold}>multiplied by 2</span>.
        </p>
      </section>

      <section className={styles.section}>
        <h3>Special Holes</h3>
        <ul>
          <li><strong>IIIs</strong> — 2 of the hardest 6 holes will be played from the III tees.</li>
          <li><strong>Tips</strong> — 2 of the easiest 6 holes will be played from the Tips.</li>
        </ul>
        <p>These don't affect scoring — just where you tee off.</p>
      </section>

      <section className={styles.section}>
        <h3>Team Scoring</h3>
        <p>Teams of 2 players. The <strong>team score</strong> is the sum of both players' individual points across all 18 holes.</p>
      </section>

      <section className={styles.section}>
        <h3>Formula</h3>
        <p className={styles.formula}>Points = max(0, 2 − net score) × multiplier</p>
        <p className={styles.small}>Where net score = gross − par − strokes received</p>
      </section>
    </div>
  )
}
