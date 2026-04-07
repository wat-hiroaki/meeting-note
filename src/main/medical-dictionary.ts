/**
 * Medical terminology dictionaries for Whisper initial_prompt injection.
 *
 * These terms are passed as `initial_prompt` to Whisper, which significantly
 * improves recognition accuracy for domain-specific vocabulary.
 * Organized by medical specialty for use in 自由診療 (free practice) clinics.
 */

export type MedicalSpecialty =
  | 'general'
  | 'internal'
  | 'dermatology'
  | 'orthopedics'
  | 'ophthalmology'
  | 'dentistry'
  | 'psychiatry'
  | 'obstetrics'
  | 'pediatrics'
  | 'cosmetic'
  | 'pain_clinic'
  | 'rehabilitation'
  | 'custom'

export interface MedicalDictionary {
  specialty: MedicalSpecialty
  label: string
  terms: string[]
}

// ===== 共通医療用語（全科で共有） =====
const COMMON_TERMS = [
  // バイタルサイン
  '血圧', '収縮期血圧', '拡張期血圧', '脈拍', '心拍数', '体温', 'SpO2',
  '酸素飽和度', '呼吸数', 'BMI', '体重', '身長',
  // 検査
  '血液検査', '尿検査', 'CT', 'MRI', 'X線', 'レントゲン', 'エコー',
  '心電図', '心エコー', '腹部エコー', '内視鏡', '生検', '病理検査',
  // 基本検査値
  'HbA1c', 'eGFR', 'クレアチニン', 'BUN', 'AST', 'ALT', 'γ-GTP',
  'CRP', '白血球', '赤血球', 'ヘモグロビン', '血小板', 'HDL', 'LDL',
  '中性脂肪', 'TSH', 'T3', 'T4', 'HBs抗原', 'HCV抗体',
  // SOAP
  'SOAP', '主訴', '現病歴', '既往歴', '家族歴', 'アレルギー歴',
  '服薬歴', '社会歴', '理学所見', '身体所見', '評価', '治療計画',
  // 診療共通
  '処方', '処方箋', '投薬', '内服', '外用', '点滴', '注射', '点眼',
  '経過観察', 'フォローアップ', '再診', '初診', '紹介状', '同意書',
  'インフォームドコンセント', 'セカンドオピニオン', '予後',
  // 自由診療
  '自由診療', '自費診療', '保険適用外', '混合診療',
  '同意書', '承諾書', '説明書',
]

// ===== 診療科別の専門用語辞書 =====

const INTERNAL_TERMS = [
  // 循環器
  '高血圧', '低血圧', '不整脈', '心房細動', '心室頻拍',
  '狭心症', '心筋梗塞', '心不全', '弁膜症', '大動脈瘤',
  'アムロジピン', 'ニフェジピン', 'カルベジロール', 'ビソプロロール',
  'ワルファリン', 'DOAC', 'エドキサバン', 'リバーロキサバン',
  'ACE阻害薬', 'ARB', 'カルシウム拮抗薬', 'β遮断薬', '利尿薬',
  // 消化器
  '胃炎', '胃潰瘍', '逆流性食道炎', 'ピロリ菌', 'GERD',
  '肝炎', '肝硬変', '脂肪肝', 'NAFLD', 'NASH',
  '膵炎', '胆石', '胆嚢炎', '大腸ポリープ', '過敏性腸症候群',
  'PPI', 'ランソプラゾール', 'ウルソデオキシコール酸',
  // 呼吸器
  '喘息', 'COPD', '肺炎', '間質性肺炎', '肺気腫',
  '気管支拡張薬', '吸入ステロイド',
  // 糖尿病・代謝
  '糖尿病', '1型糖尿病', '2型糖尿病', 'インスリン', 'インスリン抵抗性',
  'メトホルミン', 'SGLT2阻害薬', 'DPP-4阻害薬', 'GLP-1受容体作動薬',
  '高脂血症', '脂質異常症', 'スタチン', 'ロスバスタチン',
  '高尿酸血症', '痛風', 'フェブキソスタット', 'アロプリノール',
  '甲状腺機能亢進症', '甲状腺機能低下症', 'バセドウ病', '橋本病',
  // 腎臓
  '慢性腎臓病', 'CKD', '腎不全', '透析', 'ネフローゼ症候群',
  // 神経
  '脳梗塞', '脳出血', 'くも膜下出血', 'パーキンソン病', 'てんかん',
  '片頭痛', '認知症', 'アルツハイマー',
]

const DERMATOLOGY_TERMS = [
  // 疾患
  'アトピー性皮膚炎', '湿疹', '蕁麻疹', '乾癬', '白癬',
  'にきび', 'ざ瘡', '酒さ', '脂漏性皮膚炎', '接触皮膚炎',
  'ヘルペス', '帯状疱疹', 'いぼ', '疣贅', 'ほくろ', '母斑',
  '粉瘤', '脂肪腫', 'ケロイド', '瘢痕',
  '白斑', 'しみ', '肝斑', '老人性色素斑', 'そばかす',
  // 治療
  'ステロイド外用', 'タクロリムス', 'デュピクセント', 'デュピルマブ',
  '保湿剤', 'ヒルドイド', 'ワセリン',
  '液体窒素', 'レーザー治療', 'フォトフェイシャル', 'ケミカルピーリング',
  'トレチノイン', 'ハイドロキノン',
  'ダーマペン', 'フラクショナルレーザー', 'CO2レーザー',
  '光線療法', 'ナローバンドUVB', 'エキシマレーザー',
  // 美容皮膚科（自由診療で多い）
  'ボトックス', 'ヒアルロン酸注入', 'フィラー',
  'PRP療法', '幹細胞治療', '再生医療',
  '医療脱毛', 'IPL', 'ジェントルマックスプロ',
  '点滴療法', 'プラセンタ注射', '高濃度ビタミンC点滴',
  'グルタチオン', 'NMN点滴',
]

const ORTHOPEDICS_TERMS = [
  // 疾患
  '骨折', '捻挫', '打撲', '脱臼', '靭帯損傷',
  '腰痛', '椎間板ヘルニア', '脊柱管狭窄症', '変形性膝関節症',
  '変形性股関節症', '五十肩', '肩関節周囲炎', '腱鞘炎',
  '関節リウマチ', '骨粗鬆症', '側弯症',
  '半月板損傷', '前十字靭帯', 'ACL', 'アキレス腱断裂',
  '手根管症候群', '坐骨神経痛', 'ばね指',
  // 検査・治療
  '関節鏡', '人工関節', '骨密度検査', 'DEXA',
  'トリガーポイント注射', 'ヒアルロン酸関節注射',
  'PRP注射', '体外衝撃波治療', 'リハビリテーション',
  'テーピング', '装具', 'コルセット', 'サポーター',
  // 薬
  'NSAIDs', 'ロキソプロフェン', 'セレコキシブ',
  'プレガバリン', 'デュロキセチン', 'トラマドール',
  'ビスホスホネート', 'デノスマブ', 'テリパラチド',
]

const OPHTHALMOLOGY_TERMS = [
  '視力', '矯正視力', '眼圧', '眼底検査', 'OCT', '視野検査',
  '白内障', '緑内障', '網膜剥離', '黄斑変性', '加齢黄斑変性',
  '糖尿病網膜症', 'ドライアイ', '結膜炎', 'ぶどう膜炎',
  '飛蚊症', '近視', '遠視', '乱視', '老眼',
  'レーシック', 'ICL', '多焦点眼内レンズ', 'オルソケラトロジー',
  '抗VEGF療法', 'アイリーア', 'ルセンティス',
  '点眼薬', 'ラタノプロスト', 'チモロール',
]

const DENTISTRY_TERMS = [
  // 疾患
  '虫歯', 'う蝕', '歯周病', '歯肉炎', '歯周炎',
  '根管治療', '抜歯', '智歯', '親知らず', '顎関節症',
  '不正咬合', '開咬', '過蓋咬合', '叢生', '反対咬合',
  // 治療
  'インプラント', 'ブリッジ', '義歯', '入れ歯', 'クラウン',
  'セラミック', 'ジルコニア', 'e-max', 'CAD/CAM',
  'ホワイトニング', 'オフィスホワイトニング', 'ホームホワイトニング',
  '矯正', 'インビザライン', 'マウスピース矯正', 'ワイヤー矯正',
  'デンタルフロス', 'スケーリング', 'SRP', 'PMTC',
  // 麻酔
  '局所麻酔', '伝達麻酔', '笑気麻酔', '静脈内鎮静法',
]

const PSYCHIATRY_TERMS = [
  'うつ病', '双極性障害', '統合失調症', '不安障害',
  'パニック障害', '社交不安障害', '強迫性障害', 'PTSD',
  '適応障害', '発達障害', 'ADHD', 'ASD', '自閉スペクトラム症',
  '不眠症', '睡眠障害', '摂食障害', 'アルコール依存症',
  'SSRI', 'SNRI', '抗不安薬', 'ベンゾジアゼピン',
  'エスシタロプラム', 'デュロキセチン', 'アリピプラゾール',
  '認知行動療法', 'CBT', 'カウンセリング', '心理検査',
  'WAIS', 'WISC', 'ロールシャッハ',
]

const OBSTETRICS_TERMS = [
  '妊娠', '出産', '分娩', '帝王切開', '自然分娩',
  '妊婦健診', 'エコー検査', '胎児心拍', 'NST',
  '妊娠高血圧症候群', '妊娠糖尿病', '切迫早産', '前置胎盤',
  '不妊治療', '体外受精', 'IVF', '顕微授精', 'ICSI',
  '人工授精', 'AIH', '排卵誘発', 'クロミフェン',
  'HCG', 'FSH', 'AMH', 'エストロゲン', 'プロゲステロン',
  '更年期障害', 'HRT', 'ホルモン補充療法',
  '子宮筋腫', '子宮内膜症', '卵巣嚢腫',
  // 自由診療で多い
  'NIPT', '出生前診断', '着床前診断', 'PGT',
  '卵子凍結', '精子凍結', 'AMH検査',
]

const PEDIATRICS_TERMS = [
  '小児科', '乳幼児', '新生児', '発育', '発達',
  '予防接種', 'ワクチン', 'MR', 'BCG', 'DPT', 'Hib',
  '母子手帳', '乳児健診', '成長曲線',
  '発熱', '風邪', '中耳炎', '気管支炎', 'RSウイルス',
  '手足口病', 'ヘルパンギーナ', 'アデノウイルス', 'ロタウイルス',
  '食物アレルギー', 'アナフィラキシー', 'エピペン',
  '夜尿症', 'チック', '起立性調節障害',
]

const COSMETIC_TERMS = [
  // 施術
  'ボトックス注射', 'ヒアルロン酸注入', 'フィラー注入',
  'リフトアップ', 'スレッドリフト', 'ハイフ', 'HIFU',
  'サーマクール', 'ウルセラ',
  '脂肪吸引', '脂肪溶解注射', 'クールスカルプティング',
  '二重整形', '埋没法', '切開法', '目頭切開',
  '鼻整形', 'プロテーゼ', '小鼻縮小',
  'フェイスリフト', '眼瞼下垂', 'たるみ取り',
  // 美容点滴・注射
  'プラセンタ注射', 'にんにく注射', '白玉点滴', 'マイヤーズカクテル',
  '高濃度ビタミンC', 'グルタチオン', 'NMN', 'エクソソーム',
  // 再生医療
  'PRP', '幹細胞', 'ステムセル', 'ACRS', 'エクソソーム療法',
  // レーザー
  'ピコレーザー', 'QスイッチYAGレーザー', 'フラクショナル',
  'ジェネシス', 'ライムライト',
  // 痩身
  'GLP-1ダイエット', 'メディカルダイエット', 'リベルサス',
  'オゼンピック', 'マンジャロ',
]

const PAIN_CLINIC_TERMS = [
  '疼痛', '慢性疼痛', '神経ブロック', '硬膜外ブロック',
  '星状神経節ブロック', 'トリガーポイント', '仙骨ブロック',
  '神経根ブロック', '関節内注射',
  'ペインスケール', 'NRS', 'VAS',
  'プレガバリン', 'ミロガバリン', 'デュロキセチン',
  'トラマドール', 'オピオイド', 'フェンタニル',
  '帯状疱疹後神経痛', '三叉神経痛', 'CRPS',
  '線維筋痛症', '筋膜性疼痛症候群',
  '高周波熱凝固法', 'パルス高周波法', 'SCS',
]

const REHABILITATION_TERMS = [
  'リハビリテーション', '理学療法', '作業療法', '言語聴覚療法',
  'ROM', '関節可動域', 'MMT', '筋力テスト',
  'ADL', '日常生活動作', 'FIM', 'バーセルインデックス',
  '歩行訓練', '筋力トレーニング', 'ストレッチ',
  '物理療法', '電気刺激', 'TENS', '超音波療法',
  '運動療法', '温熱療法', '水中運動',
  '嚥下リハビリ', '構音障害', '失語症',
  '認知リハビリ', '復職支援', '社会復帰',
]

// ===== 辞書レジストリ =====

export const MEDICAL_DICTIONARIES: MedicalDictionary[] = [
  { specialty: 'general', label: '共通医療用語', terms: COMMON_TERMS },
  { specialty: 'internal', label: '内科', terms: INTERNAL_TERMS },
  { specialty: 'dermatology', label: '皮膚科・美容皮膚科', terms: DERMATOLOGY_TERMS },
  { specialty: 'orthopedics', label: '整形外科', terms: ORTHOPEDICS_TERMS },
  { specialty: 'ophthalmology', label: '眼科', terms: OPHTHALMOLOGY_TERMS },
  { specialty: 'dentistry', label: '歯科', terms: DENTISTRY_TERMS },
  { specialty: 'psychiatry', label: '精神科・心療内科', terms: PSYCHIATRY_TERMS },
  { specialty: 'obstetrics', label: '産婦人科', terms: OBSTETRICS_TERMS },
  { specialty: 'pediatrics', label: '小児科', terms: PEDIATRICS_TERMS },
  { specialty: 'cosmetic', label: '美容外科', terms: COSMETIC_TERMS },
  { specialty: 'pain_clinic', label: 'ペインクリニック', terms: PAIN_CLINIC_TERMS },
  { specialty: 'rehabilitation', label: 'リハビリテーション科', terms: REHABILITATION_TERMS },
]

/**
 * Build initial_prompt string for Whisper from selected specialties.
 * Combines common terms + specialty-specific terms, deduped, joined with 、
 */
export function buildInitialPrompt(specialties: MedicalSpecialty[], customTerms?: string[]): string {
  const termSet = new Set<string>()

  // Always include common medical terms
  for (const term of COMMON_TERMS) {
    termSet.add(term)
  }

  // Add specialty-specific terms
  for (const specialty of specialties) {
    const dict = MEDICAL_DICTIONARIES.find(d => d.specialty === specialty)
    if (dict) {
      for (const term of dict.terms) {
        termSet.add(term)
      }
    }
  }

  // Add user custom terms
  if (customTerms) {
    for (const term of customTerms) {
      const trimmed = term.trim()
      if (trimmed) termSet.add(trimmed)
    }
  }

  return Array.from(termSet).join('、')
}

/**
 * Get dictionary metadata for UI display.
 */
export function getDictionaryInfo(): Array<{ specialty: MedicalSpecialty; label: string; termCount: number }> {
  return MEDICAL_DICTIONARIES.map(d => ({
    specialty: d.specialty,
    label: d.label,
    termCount: d.terms.length,
  }))
}
