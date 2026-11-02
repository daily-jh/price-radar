# 실행과 배포

현재 사용자 선택: **깃허브 + 개인 컴퓨터 실행**, 인터넷 배포 없음. 로컬 실행은 README의 CMD 파일을 권장합니다.

## Docker 준비 구성 (실제 Docker 실행은 미검증)

1. `.env.example` → `.env`, 비밀번호 해시 생성.
2. `.env`: `PORT=3080`, `APP_ORIGIN=http://127.0.0.1:3080`, `COOKIE_SECURE=false`.
3. `docker compose up -d --build`
4. `http://127.0.0.1:3080`에서 로그인.

볼륨은 DB를 보존합니다. Compose의 호스트 포트는 루프백에만 바인딩합니다. 다른 컴퓨터에 공개하지 않습니다.

## 향후 인터넷 배포

서버·도메인을 선택한 후 TLS 프록시 및 개인 접근 게이트웨이를 구성해야 합니다. `APP_ORIGIN`은 실제 HTTPS URL, `COOKIE_SECURE=true`, 강한 비밀번호 해시를 설정합니다. 서비스 프로세스는 비관리자 사용자로 실행하며 DB 볼륨과 접근 제한을 검증합니다. 이 문서는 서버를 생성하거나 결제하지 않습니다.

GitHub Actions는 문법 검사와 테스트만 수행합니다. 자동 인터넷 배포나 GitHub Pages 배포는 설정하지 않았습니다. [GitHub Pages 공식 설명](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages): HTML/CSS/JS 정적 호스팅 서비스입니다.
