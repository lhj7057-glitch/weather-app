// 외부 라이브러리 없이 Node.js 기본 모듈만 사용합니다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDirectory = new URL('../frontend/', import.meta.url);
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

// 일부 한글 이름은 API에서 누락되거나 작은 동명 마을로 검색됩니다.
// 주요 도시의 영문 검색어와 국가를 지정해 올바른 위치를 찾습니다.
const cityAliases = new Map([
  [['서울', '서울시', '서울특별시'], 'Seoul', 'KR'],
  [['부산', '부산시', '부산광역시'], 'Busan', 'KR'],
  [['제주', '제주시', '제주도', '제주특별자치도'], 'Jeju', 'KR'],
  [['인천', '인천시', '인천광역시'], 'Incheon', 'KR'],
  [['대구', '대구시', '대구광역시'], 'Daegu', 'KR'],
  [['대전', '대전시', '대전광역시'], 'Daejeon', 'KR'],
  [['광주', '광주광역시'], 'Gwangju', 'KR'],
  [['울산', '울산시', '울산광역시'], 'Ulsan', 'KR'],
  [['수원', '수원시'], 'Suwon', 'KR'],
  [['강릉', '강릉시'], 'Gangneung', 'KR'],
  [['속초', '속초시'], 'Sokcho', 'KR'],
  [['전주', '전주시'], 'Jeonju', 'KR'],
  [['경주', '경주시'], 'Gyeongju', 'KR'],
  [['춘천', '춘천시'], 'Chuncheon', 'KR'],
  [['여수', '여수시'], 'Yeosu', 'KR'],
  [['도쿄', '동경'], 'Tokyo', 'JP'],
  [['오사카'], 'Osaka', 'JP'],
  [['교토'], 'Kyoto', 'JP'],
  [['런던'], 'London', 'GB'],
  [['파리'], 'Paris', 'FR'],
  [['뉴욕'], 'New York', 'US'],
].flatMap(([aliases, name, countryCode]) => aliases.map((alias) => [alias, { name, countryCode }])));

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}

async function fetchJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new ApiError(504, '날씨 서비스의 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.');
    }
    throw new ApiError(502, '날씨 서비스에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
  }

  if (response.status === 429) {
    throw new ApiError(503, '날씨 서비스의 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok) {
    throw new ApiError(502, '날씨 서비스에서 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  try {
    const data = await response.json();
    if (!data || data.error) throw new Error('Invalid upstream response');
    return data;
  } catch {
    throw new ApiError(502, '날씨 서비스의 응답을 읽을 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
}

async function getWeather(city, fetchImpl) {
  // 1. 도시 이름을 위도와 경도로 변환합니다.
  const alias = cityAliases.get(city);
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodingUrl.search = new URLSearchParams({
    name: alias?.name ?? city,
    count: '1',
    language: 'ko',
    format: 'json',
  }).toString();
  if (alias) geocodingUrl.searchParams.set('countryCode', alias.countryCode);
  const geocoding = await fetchJson(geocodingUrl, fetchImpl);
  if (geocoding.results !== undefined && !Array.isArray(geocoding.results)) {
    throw new ApiError(502, '도시 검색 서비스의 응답이 올바르지 않아요.');
  }
  const location = geocoding.results?.[0];
  if (!location) {
    throw new ApiError(404, '도시를 찾을 수 없어요. 이름을 확인하거나 영문 이름으로 검색해 주세요.');
  }
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new ApiError(502, '도시의 위치 정보를 가져오지 못했어요.');
  }

  // 2. 해당 좌표의 현재 날씨를 가져옵니다. API 키가 필요하지 않습니다.
  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    temperature_unit: 'celsius',
    wind_speed_unit: 'ms',
    precipitation_unit: 'mm',
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '1',
  }).toString();
  const weather = await fetchJson(weatherUrl, fetchImpl);
  const current = weather.current;
  if (!current || !Number.isFinite(current.temperature_2m) ||
      !Number.isFinite(current.time) || !Number.isFinite(current.weather_code) ||
      typeof weather.timezone !== 'string') {
    throw new ApiError(502, '현재 날씨 정보가 아직 제공되지 않아요. 잠시 후 다시 시도해 주세요.');
  }

  // 프론트엔드에서 사용하기 쉬운 JSON으로 정리해서 반환합니다.
  return {
    location: {
      name: location.name,
      region: location.admin1 ?? '',
      country: location.country ?? '',
      countryCode: location.country_code ?? '',
      latitude: location.latitude,
      longitude: location.longitude,
    },
    timezone: weather.timezone,
    current: {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature ?? null,
      humidity: current.relative_humidity_2m ?? null,
      windSpeed: current.wind_speed_10m ?? null,
      precipitation: current.precipitation ?? null,
      weatherCode: current.weather_code,
      isDay: current.is_day === 1,
      time: current.time,
      interval: current.interval ?? 900,
    },
  };
}

export function createWeatherServer({ fetchImpl = globalThis.fetch } = {}) {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");

    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/weather') {
        if (request.method !== 'GET') {
          response.setHeader('Allow', 'GET');
          sendJson(response, 405, { error: 'GET 요청만 사용할 수 있어요.' });
          return;
        }
        const city = (url.searchParams.get('city') ?? '').trim().replace(/\s+/g, ' ');
        if (city.length < 2 || city.length > 100) {
          throw new ApiError(400, '도시 이름을 2~100자로 입력해 주세요.');
        }
        sendJson(response, 200, await getWeather(city, fetchImpl));
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        sendJson(response, 405, { error: '지원하지 않는 요청 방식이에요.' });
        return;
      }
      // 지정한 프론트엔드 파일만 제공하므로 백엔드 소스는 노출되지 않습니다.
      const staticFile = staticFiles.get(url.pathname);
      if (!staticFile) {
        sendJson(response, 404, { error: '페이지를 찾을 수 없어요.' });
        return;
      }
      const [filename, contentType] = staticFile;
      const content = await readFile(new URL(filename, frontendDirectory));
      response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Server error:', error.message);
      sendJson(response, error.status ?? 500, {
        error: error instanceof ApiError ? error.message : '서버에서 오류가 발생했어요. 다시 시도해 주세요.',
      });
    }
  });
}

// 직접 실행할 때만 서버를 시작합니다. 테스트에서는 함수를 가져와 사용합니다.
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT는 1~65535 사이의 정수여야 합니다.');
    process.exit(1);
  }
  const server = createWeatherServer();
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `${port}번 포트가 사용 중입니다. 다른 PORT를 지정해 주세요.`
      : `서버를 시작하지 못했습니다: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`날씨 웹앱: http://localhost:${port}`);
    console.log('종료하려면 Ctrl+C를 누르세요.');
  });
}
