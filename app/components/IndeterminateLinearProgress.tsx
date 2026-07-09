import { memo } from "react";
import styles from "../styles/indeterminate-linear-progress.module.css";

export type IndeterminateLinearProgressProps = {
  /** Pin under the top of the viewport (e.g. during client navigations). */
  fixed?: boolean;
};

/**
 * Full-width indeterminate bar (Material `LinearProgress` indeterminate look)
 * without @mui — Polaris CSS variables where available.
 */
export const IndeterminateLinearProgress = memo(function IndeterminateLinearProgress({
  fixed = false,
}: IndeterminateLinearProgressProps) {
  return (
    <div
      className={fixed ? `${styles.wrap} ${styles.wrapFixed}` : styles.wrap}
      role="progressbar"
      aria-busy="true"
      aria-valuetext="Loading"
    >
      <div className={styles.track}>
        <div className={styles.bar} />
      </div>
    </div>
  );
});
