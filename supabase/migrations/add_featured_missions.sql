-- Featured/Special Missions Table
-- 관리자가 직접 만든 특별 미션 (이벤트, 시즌 미션 등)
CREATE TABLE IF NOT EXISTS featured_missions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,

  -- 미션 정보 (mission_id가 있으면 해당 미션 사용, 없으면 직접 입력)
  title TEXT,
  description TEXT,
  category TEXT,
  difficulty INTEGER,
  duration TEXT,
  location_type TEXT,
  tags TEXT[],
  icon TEXT,
  image_url TEXT,
  estimated_time INTEGER,

  -- 노출 기간
  start_date DATE,
  end_date DATE,

  -- 상태 및 우선순위
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- 높을수록 우선순위 높음 (0-100)

  -- 타겟 설정
  target_audience TEXT DEFAULT 'all', -- 'all', 'new_couples', 'long_term', etc.

  -- 메타데이터
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_featured_missions_dates
ON featured_missions(start_date, end_date, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_featured_missions_active
ON featured_missions(is_active, priority DESC)
WHERE is_active = true;

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_featured_missions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER featured_missions_updated_at
BEFORE UPDATE ON featured_missions
FOR EACH ROW
EXECUTE FUNCTION update_featured_missions_updated_at();

-- 샘플 데이터 (테스트용)
-- 실제 배포 시 삭제하거나 주석 처리
INSERT INTO featured_missions (
  title,
  description,
  category,
  difficulty,
  duration,
  location_type,
  tags,
  icon,
  image_url,
  estimated_time,
  start_date,
  end_date,
  is_active,
  priority,
  target_audience
) VALUES
(
  '크리스마스 특별 데이트',
  '크리스마스를 맞아 특별한 추억을 만들어보세요! 함께 트리를 보러 가거나 캐럴을 들으며 산책해보세요.',
  'special',
  2,
  '2-3시간',
  'outdoor',
  ARRAY['christmas', 'romantic', 'seasonal'],
  '🎄',
  'https://images.unsplash.com/photo-1512389142860-9c449e58a543',
  150,
  '2024-12-20',
  '2024-12-26',
  true,
  90,
  'all'
),
(
  '발렌타인데이 스페셜',
  '발렌타인데이를 맞아 서로에게 사랑을 표현하는 특별한 시간을 가져보세요.',
  'romance',
  1,
  '1-2시간',
  'any',
  ARRAY['valentine', 'romantic', 'sweet'],
  '💝',
  'https://images.unsplash.com/photo-1518199266791-5375a83190b7',
  90,
  '2025-02-10',
  '2025-02-15',
  false, -- 아직 비활성화
  95,
  'all'
);

-- RLS (Row Level Security) 정책
-- 모든 사용자는 active한 featured missions를 읽을 수 있음
ALTER TABLE featured_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active featured missions"
ON featured_missions FOR SELECT
USING (is_active = true);

-- 관리자만 생성/수정/삭제 가능 (나중에 role 기반으로 수정 필요)
CREATE POLICY "Service role can manage featured missions"
ON featured_missions FOR ALL
USING (auth.role() = 'service_role');
