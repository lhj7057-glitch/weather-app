# 오늘 — 날씨 웹앱

도시 이름을 입력하고 **날씨 확인**을 누르면 현재 날씨를 보여주는 작은 웹앱입니다.
프론트엔드는 HTML·CSS·JavaScript, 백엔드는 Node.js 기본 `http` 모듈을 사용합니다.
프레임워크, 외부 패키지, API 키, 회원가입 없이 실행할 수 있습니다.

## 1. Node.js 준비

**Node.js 22 이상**이 필요합니다. 설치되어 있지 않으면 [Node.js 공식 사이트](https://nodejs.org/)에서 설치한 뒤 터미널을 다시 여세요.

```powershell
node --version
```

`v22.x.x` 이상이 나오면 준비된 것입니다.

## 2. 프로젝트 폴더 열기

VS Code에서 이 폴더를 열고 **터미널 → 새 터미널**을 선택하세요.
또는 PowerShell에서 다음 명령을 실행하세요.

```powershell
cd "C:\Users\USER\Desktop\Vibe coding\강의자료\week7\wether-app"
```

## 3. 백엔드 실행

```powershell
node backend/server.js
```

`날씨 웹앱: http://localhost:3000`이 출력됩니다.
설치할 외부 패키지가 없으므로 `npm install`은 필요하지 않습니다.
같은 서버가 프론트엔드 파일도 제공하므로 별도 프론트엔드 서버도 필요하지 않습니다.

## 4. 브라우저에서 사용

1. [http://localhost:3000](http://localhost:3000)을 엽니다.
2. 도시 이름을 입력합니다. 예: `서울`, `부산`, `London`, `Tokyo`.
3. **날씨 확인** 버튼을 누르거나 Enter를 누릅니다.
4. 기온, 날씨 상태, 체감 온도, 습도, 풍속, 강수량을 확인합니다.

검색하는 동안 터미널의 서버를 계속 켜 두세요. 종료하려면 터미널에서 **Ctrl+C**를 누릅니다.
`frontend/index.html`을 파일로 직접 열면 백엔드에 연결되지 않습니다. 위 주소로 접속하세요.
실제 날씨 조회에는 인터넷 연결이 필요합니다.

## 파일 구성

```text
wether-app/
├─ frontend/             # 브라우저에서 실행하는 파일
│  ├─ index.html          # 화면 구조와 도시 검색 폼
│  ├─ styles.css          # 반응형 디자인
│  ├─ app.js              # 백엔드 요청, 날씨 표시, 로딩·오류 처리
│  └─ favicon.svg         # 브라우저 탭 아이콘
├─ backend/
│  └─ server.js           # 정적 파일 제공, 외부 API 호출
├─ tests/
│  └─ server.test.js      # 백엔드 통합 테스트
├─ package.json
└─ README.md
```

## 데이터가 오가는 순서

```text
브라우저 frontend/app.js
  → GET /api/weather?city=서울
  → 백엔드 backend/server.js
  → Open-Meteo Geocoding API로 도시의 위도·경도 검색
  → Open-Meteo Weather API로 현재 날씨 조회
  → 백엔드가 정리한 JSON 반환
  → 브라우저에 날씨 표시
```

프론트엔드는 외부 API를 직접 호출하지 않습니다. 모든 외부 요청은 백엔드에서 처리합니다.
도시를 찾을 수 없으면 404, 입력 오류는 400, 외부 서비스 연결 오류는 502,
외부 서비스 요청 한도는 503, 외부 서비스 응답 지연은 504로 알려 줍니다.

### 사용한 무료 API

- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api): 도시 이름을 좌표로 변환합니다. 위치 데이터 출처는 [GeoNames](https://www.geonames.org/)입니다.
- [Open-Meteo Weather API](https://open-meteo.com/en/docs): `current` 항목으로 현재 날씨를 요청합니다. 기온은 °C, 풍속은 m/s, 강수량은 mm입니다.
- [Open-Meteo 무료 사용 범위](https://open-meteo.com/en/pricing): 무료 공개 API는 비상업적 사용에 제공되며 API 키가 필요하지 않습니다. 상업적으로 사용할 때는 해당 서비스의 요금·이용 조건을 확인하세요.

현재 날씨는 15분 간격 기상 모델 자료에 기반하며 관측소의 실측값과 다를 수 있습니다.
화면의 기준 시각은 **검색한 도시의 현지 시간**입니다. 강수량은 API가 반환한 시간 구간의 합계이며, 기본 구간은 15분입니다.
화면 표시를 위해 날씨 코드를 한국어로 번역하고 숫자를 소수점 한 자리까지 표시합니다.

동명이 있는 도시는 API의 첫 번째 검색 결과를 사용하며 국가·지역을 함께 표시합니다.
`Paris, France`처럼 국가를 붙여 위치를 좁힐 수 있습니다.
서울·부산·제주 등 주요 국내 도시와 도쿄·런던·파리 등 일부 해외 도시는
한글 이름을 영문 검색어로 변환하고 국가를 지정해 검색합니다.
한글 검색 결과가 없을 때는 영문 도시 이름으로 다시 시도하세요.

## 문제 해결

- **3000번 포트가 이미 사용 중**: PowerShell에서 아래처럼 다른 포트를 지정하세요.

  ```powershell
  $env:PORT = "3001"
  node backend/server.js
  ```

  이후 `http://localhost:3001`로 접속합니다. 기본값으로 되돌리려면 `Remove-Item Env:PORT`를 실행하세요.

- **날씨 서비스에 연결할 수 없음**: 인터넷 연결, 방화벽, 서비스의 일시적인 장애를 확인하세요. 백엔드가 두 Open-Meteo API 도메인에 HTTPS 요청을 보낼 수 있어야 합니다.
- **PowerShell에서 npm이 차단됨**: 위의 `node` 실행 명령을 사용하면 됩니다. npm 명령을 사용하려면 Windows에서는 `npm.cmd start` 또는 `npm.cmd test`로 실행할 수 있습니다.

## 테스트

```powershell
node --test
```

Node.js 내장 테스트 도구로 정상 조회, 한글 도시 이름 변환과 국가 지정, 잘못된 입력,
검색 결과 없음, 외부 API 오류, 시간 초과, 백엔드 파일 접근 차단을 확인합니다.
테스트에서 외부 API를 대체하므로 인터넷 없이 실행할 수 있습니다.
