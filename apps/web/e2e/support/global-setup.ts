import { API_URL } from '../../scripts/e2e/safety.mjs';

export default async function globalSetup() {
  const response = await fetch(`${API_URL}/__e2e__/ready`);
  const marker = await response.json();
  if (!response.ok || marker.service !== 'tutor-e2e' || !marker.run_id) {
    throw new Error('E2E: ambiente não comprovado no setup.');
  }
  process.env.E2E_EXPECTED_RUN_ID = marker.run_id;
}
