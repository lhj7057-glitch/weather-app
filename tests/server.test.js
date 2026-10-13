import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWeatherServer } from '../backend/server.js';

const location = {
  name: '서울', latitude: 37.5665, longitude: 126.978,
  admin1: '서울특별시', country: '대한민국', country_code: 'KR',
};
const weather = {
  timezone: 'Asia/Seoul',
  current: {
    time: 1791856800, interval: 900, temperature_2m: 21.3,
    apparent_temperature: 20.5, relative_humidity_2m: 61,
    wind_speed_10m: 2.1, precipitation: 0, weather_code: 2, is_day: 1,
  },
};
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

async function startServer(t, fetchImpl) {
  const server = createWeatherServer({ fetchImpl });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('한글 도시를 전달하고 위치·단위·현재 날씨를 반환한다', async (t) => {
  const calls = [];
  const base = await startServer(t, async (url) => {
    calls.push(new URL(url));
    return jsonResponse(calls.length === 1 ? { results: [location] } : weather);
  });
  const response = await fetch(`${base}/api/weather?${new URLSearchParams({ city: ' 서울 ' })}`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(calls[0].hostname, 'geocoding-api.open-meteo.com');
  assert.equal(calls[0].searchParams.get('name'), 'Seoul');
  assert.equal(calls[0].searchParams.get('countryCode'), 'KR');
  assert.equal(calls[1].hostname, 'api.open-meteo.com');
  assert.equal(calls[1].searchParams.get('latitude'), String(location.latitude));
  assert.equal(calls[1].searchParams.get('wind_speed_unit'), 'ms');
  assert.equal(calls[1].searchParams.get('timeformat'), 'unixtime');
  assert.equal(data.location.name, '서울');
  assert.equal(data.current.temperature, 21.3);
  assert.equal(data.current.humidity, 61);
  assert.equal(data.current.precipitation, 0);
  assert.equal(data.current.isDay, true);
  assert.equal(data.current.time, weather.current.time);
  assert.equal(data.timezone, 'Asia/Seoul');
});

test('부산·제주·해외 주요 도시의 한글 이름은 국가를 지정해 검색한다', async (t) => {
  const searches = [];
  const base = await startServer(t, async (url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'geocoding-api.open-meteo.com') {
      searches.push([parsedUrl.searchParams.get('name'), parsedUrl.searchParams.get('countryCode')]);
      return jsonResponse({ results: [location] });
    }
    return jsonResponse(weather);
  });
  for (const city of ['부산', '제주', '도쿄', '런던']) {
    assert.equal((await fetch(`${base}/api/weather?${new URLSearchParams({ city })}`)).status, 200);
  }
  assert.deepEqual(searches, [['Busan', 'KR'], ['Jeju', 'KR'], ['Tokyo', 'JP'], ['London', 'GB']]);
});

test('빈 입력·공백·한 글자·너무 긴 입력은 외부 API 호출 없이 거부한다', async (t) => {
  let calls = 0;
  const base = await startServer(t, async () => { calls++; throw new Error('Unexpected API call'); });
  for (const city of ['', '   ', 'a', 'a'.repeat(101)]) {
    const response = await fetch(`${base}/api/weather?${new URLSearchParams({ city })}`);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /2~100/);
  }
  assert.equal(calls, 0);
});

test('검색 결과가 없으면 한국어 오류와 404를 반환한다', async (t) => {
  const base = await startServer(t, async () => jsonResponse({}));
  const response = await fetch(`${base}/api/weather?city=NoSuchCity`);
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /도시를 찾을 수/);
});

test('외부 API 장애·요청 한도·시간 초과를 처리한다', async (t) => {
  const cases = [
    ['연결 실패', async () => { throw new TypeError('fetch failed'); }, 502],
    ['서비스 오류', async () => jsonResponse({}, 500), 502],
    ['요청 한도', async () => jsonResponse({}, 429), 503],
    ['시간 초과', async () => { throw new DOMException('Timeout', 'TimeoutError'); }, 504],
    ['잘못된 JSON', async () => new Response('not json'), 502],
  ];
  for (const [name, fetchImpl, expectedStatus] of cases) {
    await t.test(name, async (subtest) => {
      const base = await startServer(subtest, fetchImpl);
      const response = await fetch(`${base}/api/weather?city=Seoul`);
      assert.equal(response.status, expectedStatus);
      assert.equal(typeof (await response.json()).error, 'string');
    });
  }
});

test('도시 조회 후 날씨 API의 실패도 오류로 반환한다', async (t) => {
  let calls = 0;
  const base = await startServer(t, async () => jsonResponse(++calls === 1 ? { results: [location] } : {}, calls === 1 ? 200 : 500));
  const response = await fetch(`${base}/api/weather?city=Seoul`);
  assert.equal(response.status, 502);
  assert.equal(calls, 2);
});

test('필수 날씨가 누락되면 성공으로 표시하지 않는다', async (t) => {
  let calls = 0;
  const base = await startServer(t, async () => jsonResponse(++calls === 1 ? { results: [location] } : { timezone: 'Asia/Seoul', current: {} }));
  const response = await fetch(`${base}/api/weather?city=Seoul`);
  assert.equal(response.status, 502);
});

test('프론트엔드 파일만 제공하고 백엔드·프로젝트 파일 접근을 차단한다', async (t) => {
  const base = await startServer(t, async () => { throw new Error('Unexpected API call'); });
  for (const pathname of ['/', '/styles.css', '/app.js', '/favicon.svg']) {
    const response = await fetch(`${base}${pathname}`);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 0);
  }
  for (const pathname of ['/backend/server.js', '/package.json', '/README.md', '/%2e%2e/backend/server.js']) {
    assert.equal((await fetch(`${base}${pathname}`)).status, 404);
  }
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('날씨 API는 GET만 허용한다', async (t) => {
  const base = await startServer(t, async () => { throw new Error('Unexpected API call'); });
  const response = await fetch(`${base}/api/weather?city=Seoul`, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});
