// Mission Images from Unsplash
// 카테고리별 이미지 URL (앱 용량에 영향 없음 - URL 문자열만 저장)

export type MissionCategory =
  // 🍴 Food & Drink
  | 'cafe'
  | 'restaurant'
  | 'streetfood'
  | 'dessert'
  | 'cooking'
  | 'drink'
  | 'brunch'
  // 🏞️ Place & Environment
  | 'outdoor'
  | 'home'
  | 'travel'
  | 'daytrip'
  | 'drive'
  | 'night'
  | 'nature'
  // 🎯 Activities
  | 'culture'
  | 'movie'
  | 'sports'
  | 'fitness'
  | 'wellness'
  | 'creative'
  | 'game'
  | 'shopping'
  | 'photo'
  | 'learning'
  // 💝 Special & Romantic
  | 'romantic'
  | 'anniversary'
  | 'surprise'
  | 'memory'
  // 🌐 Online
  | 'online'
  | 'challenge';

const UNSPLASH_BASE = 'https://images.unsplash.com';
const IMAGE_PARAMS = '?w=600&q=80&auto=format';

export const MISSION_IMAGES: Record<MissionCategory, string[]> = {
  // 🍴 Food & Drink
  cafe: [
    `${UNSPLASH_BASE}/photo-1501339847302-ac426a4a7cbb${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1554118811-1e0d58224f24${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1495474472287-4d71bcdd2085${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1509042239860-f550ce710b93${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1442512595331-e89e73853f31${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1445116572660-236099ec97a0${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1453614512568-c4024d13c247${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1559496417-e7f25cb247f3${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1498804103079-a6351b050096${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1521017432531-fbd92d768814${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1514432324607-a09d9b4aefdd${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1485182708500-e8f1f318ba72${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1511920170033-f8396924c348${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1493925410384-84f842e616fb${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1559305616-3f99cd43e353${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1517701550927-30cf4ba1dba5${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1534040385115-33dcb3acba5b${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1525610553991-2bede1a236e2${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1463797221720-6b07e6426c24${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1518057111178-44a106bad636${IMAGE_PARAMS}`,
  ],

  restaurant: [
    `${UNSPLASH_BASE}/photo-1517248135467-4c7edcad34c4${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1552566626-52f8b828add9${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1414235077428-338989a2e8c0${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1555396273-367ea4eb4db5${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1544025162-d76694265947${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1504674900247-0877df9cc836${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1476224203421-9ac39bcb3327${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1540189549336-e6e99c3679fe${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1565299624946-b28f40a0ae38${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1482049016gy-2b8d3bb5e31f${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1567620905732-57e1f6e91b97${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1559339352-11d035aa65de${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1551218808-94e220e084d2${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1466978913421-dad2ebd01d17${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1559847844-5315695dadae${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1484980972926-edee96e0960d${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1529543544277-82c2e2c35d71${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1550966871-3ed3cdb5ed0c${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1537047902294-62a40c20a6ae${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1515669097368-22e68427d265${IMAGE_PARAMS}`,
  ],

  streetfood: [],
  dessert: [],

  cooking: [
    `${UNSPLASH_BASE}/photo-1556910103-1c02745aae4d${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1466637574441-749b8f19452f${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1507048331197-7d4ac70811cf${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1551218808-94e220e084d2${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1528712306091-ed0763094c98${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1495521821757-a1efb6729352${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1540914124281-342587941389${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1600565193348-f74bd3c7ccdf${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1481931098730-318b6f776db0${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1547592180-85f173990554${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1542010589005-d1eacc3918f2${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1505935428862-770b6f24f629${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1563379926898-05f4575a45d8${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1490645935967-10de6ba17061${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1543353071-087092ec393a${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1607877361964-d8e11e745566${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1504754524776-8f4f37790ca0${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1452251889946-8ff5ea7b27ab${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1498837167922-ddd27525d352${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1476718406336-bb5a9690ee2a${IMAGE_PARAMS}`,
  ],

  drink: [],
  brunch: [],

  // 🏞️ Place & Environment
  outdoor: [
    `${UNSPLASH_BASE}/photo-1506905925346-21bda4d32df4${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1441974231531-c6227db76b6e${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1469474968028-56623f02e42e${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1426604966848-d7adac402bff${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1470071459604-3b5ec3a7fe05${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1447752875215-b2761acb3c5d${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1433086966358-54859d0ed716${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1501785888041-af3ef285b470${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1475924156734-496f6cac6ec1${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1507003211169-0a1dd7228f2d${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1465188162913-8fb5709d6d57${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1504280390367-361c6d9f38f4${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1476611338391-6f395a0dd982${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1510797215324-95aa89f43c33${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1506744038136-46273834b3fb${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1472214103451-9374bd1c798e${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1418065460487-3e41a6c84dc5${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1464822759023-fed622ff2c3b${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1500534314209-a25ddb2bd429${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1505765050516-f72dcac9c60e${IMAGE_PARAMS}`,
  ],

  home: [
    `${UNSPLASH_BASE}/photo-1489171078254-c3365d6e359f${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1522771739844-6a9f6d5f14af${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1540518614846-7eded433c457${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1502672260266-1c1ef2d93688${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1493809842364-78817add7ffb${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1560448204-e02f11c3d0e2${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1583847268964-b28dc8f51f92${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1615529182904-14819c35db37${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1558618666-fcd25c85cd64${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1618220179428-22790b461013${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1513694203232-719a280e022f${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1560185893-a55cbc8c57e8${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1585412727339-54e4bae3bbf9${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1586023492125-27b2c045efd7${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1556909114-f6e7ad7d3136${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1595526114035-0d45ed16cfbf${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1585128792020-803d29415281${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1600585154340-be6161a56a0c${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1554995207-c18c203602cb${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1600566753086-00f18fb6b3ea${IMAGE_PARAMS}`,
  ],

  travel: [
    `${UNSPLASH_BASE}/photo-1469854523086-cc02fe5d8800${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1488646953014-85cb44e25828${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1503220317375-aaad61436b1b${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1476514525535-07fb3b4ae5f1${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1530789253388-582c481c54b0${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1501555088652-021faa106b9b${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1527631746610-bca00a040d60${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1504609773096-104ff2c73ba4${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1523906834658-6e24ef2386f9${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1502791451862-7bd8c1df43a7${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1528127269322-539801943592${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1518684079-3c830dcef090${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1507608616759-54f48f0af0ee${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1493976040374-85c8e12f0c0e${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1508672019048-805c876b67e2${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1520466809213-7b9a56adcd45${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1500835556837-99ac94a94552${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1483683804023-6ccdb62f86ef${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1516483638261-f4dbaf036963${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1473625247510-8ceb1760943f${IMAGE_PARAMS}`,
  ],

  daytrip: [],
  drive: [],

  night: [
    `${UNSPLASH_BASE}/photo-1519681393784-d120267933ba${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1507400492013-162706c8c05e${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1470252649378-9c29740c9fa8${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1514565131-fce0801e5785${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1477959858617-67f85cf4f1df${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1493809842364-78817add7ffb${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1520483691742-bada60a1edd6${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1444723121867-7a241cacace9${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1502899576159-f224dc2349fa${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1519608487953-e999c86e7455${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1532978379173-523e16f371f2${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1473116763249-2faaef81ccda${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1531297484001-80022131f5a1${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1534430480872-3498386e7856${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1515825838458-f2a94b20105a${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1506816561089-5cc37b4330ee${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1492571350019-22de08371fd3${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1503899036084-c55cdd92da26${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1494366080280-c39e0f2e4241${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1509099836639-18ba1795216d${IMAGE_PARAMS}`,
  ],

  nature: [],

  // 🎯 Activities
  culture: [
    `${UNSPLASH_BASE}/photo-1489599849927-2ee91cede3ba${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1536440136628-849c177e76a1${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1440404653325-ab127d49abc1${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1518998053901-5348d3961a04${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1507003211169-0a1dd7228f2d${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1533174072545-7a4b6ad7a6c3${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1514525253161-7a46d19cd819${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1501281668745-f7f57925c3b4${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1524368535928-5b5e00ddc76b${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1507924538820-ede94a04019d${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1460723237483-7a6dc9d0b212${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1594909122845-11baa439b7bf${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1513106580091-1d82408b8cd6${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1534531173927-aeb928d54385${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1580809361436-42a7ec204889${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1478720568477-152d9b164e26${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1485095329183-d0797cdc5676${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1574267432553-4b4628081c31${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1598387993441-a364f854c3e1${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1468164016595-6108e4c60c8b${IMAGE_PARAMS}`,
  ],

  movie: [],
  sports: [],
  fitness: [],
  wellness: [],
  creative: [],
  game: [],
  shopping: [],
  photo: [],
  learning: [],

  // 💝 Special & Romantic
  romantic: [
    `${UNSPLASH_BASE}/photo-1518199266791-5375a83190b7${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1522673607200-164d1b6ce486${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1516589178581-6cd7833ae3b2${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1529634597503-139d3726fed5${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1518621736915-f3b1c41bfd00${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1474552226712-ac0f0961a954${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1522098543979-ffc7f79a56c4${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1503516459261-40c66117780a${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1544027993-37dbfe43562a${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1507608443039-bfde4fbcd142${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1529333166437-7750a6dd5a70${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1545389336-cf090694435e${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1518568403628-df55701ade9e${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1527529482837-4698179dc6ce${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1494774157365-9e04c6720e47${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1508214751196-bcfd4ca60f91${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1537204696486-967f1b7198c8${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1523301343968-6a6ebf63c672${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1491438590914-bc09fcaaf77a${IMAGE_PARAMS}`,
    `${UNSPLASH_BASE}/photo-1516967124798-10656f7dca28${IMAGE_PARAMS}`,
  ],

  anniversary: [],
  surprise: [],
  memory: [],

  // 🌐 Online
  online: [],
  challenge: [],
};

// 카테고리별 랜덤 이미지 1개 가져오기
export const getRandomImage = (category: MissionCategory): string => {
  const images = MISSION_IMAGES[category];
  if (images.length === 0) {
    // 이미지가 없는 카테고리는 모든 이미지에서 랜덤 선택
    return getRandomImageFromAll();
  }
  return images[Math.floor(Math.random() * images.length)];
};

// 카테고리별 랜덤 이미지 N개 가져오기 (중복 없이)
export const getRandomImages = (category: MissionCategory, count: number): string[] => {
  const images = [...MISSION_IMAGES[category]];
  if (images.length === 0) {
    // 이미지가 없는 카테고리는 모든 이미지에서 랜덤 선택
    return Array.from({ length: count }, () => getRandomImageFromAll());
  }

  const result: string[] = [];
  const maxCount = Math.min(count, images.length);

  for (let i = 0; i < maxCount; i++) {
    const randomIndex = Math.floor(Math.random() * images.length);
    result.push(images[randomIndex]);
    images.splice(randomIndex, 1);
  }

  return result;
};

// 모든 카테고리에서 랜덤 이미지 1개 가져오기
export const getRandomImageFromAll = (): string => {
  const categoriesWithImages = (Object.keys(MISSION_IMAGES) as MissionCategory[]).filter(
    (cat) => MISSION_IMAGES[cat].length > 0
  );
  const randomCategory = categoriesWithImages[Math.floor(Math.random() * categoriesWithImages.length)];
  return getRandomImage(randomCategory);
};

// 카테고리 한글 이름
export const CATEGORY_LABELS: Record<MissionCategory, string> = {
  // 🍴 Food & Drink
  cafe: '카페',
  restaurant: '레스토랑',
  streetfood: '맛집투어',
  dessert: '디저트',
  cooking: '함께 요리',
  drink: '바/펍',
  brunch: '브런치',

  // 🏞️ Place & Environment
  outdoor: '야외',
  home: '홈데이트',
  travel: '여행',
  daytrip: '당일치기',
  drive: '드라이브',
  night: '야경',
  nature: '자연',

  // 🎯 Activities
  culture: '문화생활',
  movie: '영화',
  sports: '스포츠',
  fitness: '운동',
  wellness: '힐링',
  creative: '만들기',
  game: '게임',
  shopping: '쇼핑',
  photo: '사진',
  learning: '함께 배우기',

  // 💝 Special & Romantic
  romantic: '로맨틱',
  anniversary: '기념일',
  surprise: '깜짝 이벤트',
  memory: '추억 만들기',

  // 🌐 Online
  online: '온라인',
  challenge: '챌린지',
};

export default MISSION_IMAGES;
