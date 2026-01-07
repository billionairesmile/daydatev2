const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Apple Sign-In 설정
const TEAM_ID = '8D3XV33734';
const KEY_ID = 'PDSH378R44';
const CLIENT_ID = 'com.daydate.app.web';  // Services ID for web OAuth

// .p8 파일 경로
const privateKeyPath = path.join(process.env.HOME, 'Downloads', 'AuthKey_PDSH378R44.p8');

try {
  // Private key 읽기
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

  // JWT 생성 (6개월 유효)
  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '180d', // 6개월
    audience: 'https://appleid.apple.com',
    issuer: TEAM_ID,
    subject: CLIENT_ID,
    keyid: KEY_ID,
  });

  console.log('\n========== Apple Client Secret (JWT) ==========\n');
  console.log(token);
  console.log('\n================================================\n');
  console.log('이 값을 Supabase Apple Provider의 Secret 필드에 붙여넣으세요.');
  console.log('유효기간: 6개월 (180일)\n');

} catch (error) {
  console.error('Error:', error.message);
  if (error.code === 'ENOENT') {
    console.error(`\n파일을 찾을 수 없습니다: ${privateKeyPath}`);
    console.error('다운로드한 .p8 파일 경로를 확인하세요.');
  }
}
