const form = document.querySelector('#weather-form');
const cityInput = document.querySelector('#city-input');
const searchButton = document.querySelector('#search-button');
const buttonText = document.querySelector('#button-text');
const statusMessage = document.querySelector('#status-message');
const weatherPanel = document.querySelector('#weather-panel');
const quickButtons = [...document.querySelectorAll('[data-city]')];
const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

// Open-Meteo의 WMO 날씨 코드를 한국어 설명과 그림 종류로 바꿉니다.
function describeWeather(code, isDay) {
  const conditions = {
    0: ['맑음', 'clear'], 1: ['대체로 맑음', 'partly'],
    2: ['구름 조금', 'partly'], 3: ['흐림', 'cloudy'],
    45: ['안개', 'fog'], 48: ['착빙 안개', 'fog'],
    51: ['약한 이슬비', 'rain'], 53: ['이슬비', 'rain'], 55: ['강한 이슬비', 'rain'],
    56: ['약한 어는 이슬비', 'rain'], 57: ['강한 어는 이슬비', 'rain'],
    61: ['약한 비', 'rain'], 63: ['비', 'rain'], 65: ['강한 비', 'rain'],
    66: ['약한 어는 비', 'rain'], 67: ['강한 어는 비', 'rain'],
    71: ['약한 눈', 'snow'], 73: ['눈', 'snow'], 75: ['강한 눈', 'snow'],
    77: ['눈 알갱이', 'snow'], 80: ['약한 소나기', 'rain'],
    81: ['소나기', 'rain'], 82: ['강한 소나기', 'rain'],
    85: ['약한 눈 소나기', 'snow'], 86: ['강한 눈 소나기', 'snow'],
    95: ['뇌우', 'storm'], 96: ['우박을 동반한 뇌우', 'storm'], 99: ['강한 우박을 동반한 뇌우', 'storm'],
  };
  const [description, type] = conditions[code] ?? ['날씨 정보 없음', 'cloudy'];
  return { description: code === 0 && !isDay ? '맑은 밤' : description, type };
}

function formatValue(value) {
  return Number.isFinite(value) ? numberFormat.format(value) : '—';
}

function setLoading(loading) {
  searchButton.disabled = loading;
  quickButtons.forEach((button) => { button.disabled = loading; });
  buttonText.textContent = loading ? '확인 중' : '날씨 확인';
  document.querySelector('.button-arrow').hidden = loading;
  document.querySelector('.spinner').hidden = !loading;
  weatherPanel.setAttribute('aria-busy', String(loading));
}

function renderWeather({ location, current, timezone }) {
  const weather = describeWeather(current.weatherCode, current.isDay);
  // API 시간은 Unix 초 단위입니다. 검색한 도시의 시간대로 표시합니다.
  const timeLabel = new Intl.DateTimeFormat('ko-KR', {
    timeZone: timezone, month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(current.time * 1000));
  const locationDetail = [...new Set([location.region, location.country])]
    .filter((part) => part && part !== location.name).join(' · ');

  document.querySelector('#city-name').textContent = location.name;
  document.querySelector('#location-detail').textContent = locationDetail || '검색한 위치';
  document.querySelector('#temperature').textContent = formatValue(current.temperature);
  document.querySelector('#weather-description').textContent = weather.description;
  document.querySelector('#feels-like').textContent = formatValue(current.apparentTemperature);
  document.querySelector('#humidity').textContent = formatValue(current.humidity);
  document.querySelector('#wind-speed').textContent = formatValue(current.windSpeed);
  document.querySelector('#precipitation').textContent = formatValue(current.precipitation);
  document.querySelector('#updated-time').textContent = `${timeLabel} 기준 · 현지 시간`;
  document.querySelector('#details-note span').textContent = Number.isFinite(current.interval)
    ? `강수량은 최근 ${numberFormat.format(current.interval / 60)}분 기준입니다.`
    : '현재 시점의 날씨 정보입니다.';

  weatherPanel.dataset.weather = weather.type;
  weatherPanel.dataset.day = String(current.isDay);
  document.querySelector('#empty-state').hidden = true;
  document.querySelector('#weather-result').hidden = false;
}

async function searchWeather() {
  if (searchButton.disabled) return;
  const city = cityInput.value.trim();
  if (city.length < 2 || city.length > 100) {
    statusMessage.textContent = '도시 이름을 2~100자로 입력해 주세요.';
    statusMessage.classList.add('is-error');
    cityInput.focus();
    return;
  }

  statusMessage.classList.remove('is-error');
  statusMessage.textContent = `${city}의 날씨를 가져오고 있어요…`;
  // 새 검색에서 이전 도시의 정보를 현재 결과로 착각하지 않게 지웁니다.
  document.querySelector('#weather-result').hidden = true;
  document.querySelector('#empty-state').hidden = false;
  ['#feels-like', '#humidity', '#wind-speed', '#precipitation'].forEach((selector) => {
    document.querySelector(selector).textContent = '—';
  });
  document.querySelector('#updated-time').textContent = '하늘의 작은 변화를, 한눈에.';
  document.querySelector('#details-note span').textContent = '검색한 도시의 현재 날씨가 표시됩니다.';
  weatherPanel.dataset.weather = 'clear';
  weatherPanel.dataset.day = 'true';
  setLoading(true);

  try {
    // 외부 API는 백엔드가 호출합니다. 브라우저는 우리 서버만 호출합니다.
    const response = await fetch(`/api/weather?${new URLSearchParams({ city })}`, {
      signal: AbortSignal.timeout(25000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '날씨 정보를 가져오지 못했어요.');
    renderWeather(data);
    statusMessage.textContent = `${data.location.name}의 현재 날씨를 확인했어요.`;
    quickButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.city === city);
    });
  } catch (error) {
    statusMessage.classList.add('is-error');
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      statusMessage.textContent = '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.';
    } else if (error instanceof TypeError || error instanceof SyntaxError) {
      statusMessage.textContent = '서버에 연결할 수 없어요. 서버 실행 여부와 인터넷 연결을 확인해 주세요.';
    } else {
      statusMessage.textContent = error.message;
    }
    quickButtons.forEach((button) => { button.classList.remove('is-active'); });
  } finally {
    setLoading(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  searchWeather();
});
quickButtons.forEach((button) => {
  button.addEventListener('click', () => {
    cityInput.value = button.dataset.city;
    searchWeather();
  });
});
