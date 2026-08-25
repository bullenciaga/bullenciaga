const checks = [
  ['/', 'text/html'],
  ['/stats', 'text/html'],
  ['/chart', 'text/html'],
  ['/proof', 'text/html'],
  ['/supply', 'application/json'],
  ['/ohlcv?tf=1h', 'application/json']
];

let failures = 0;
for (const [pathname, expectedType] of checks) {
  const response = await fetch(`https://bullenciaga.com${pathname}`, { redirect: 'manual' });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes(expectedType)) {
    console.error(`${pathname}: ${response.status} ${type}; expected ${expectedType}`);
    failures++;
  } else {
    console.log(`${pathname}: ${response.status} ${type}`);
  }
}
if (failures) process.exit(1);
