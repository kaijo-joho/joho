const update = '2025-12-23 02:42:38';

const quizzes = {
  "py11": {
    "title": "1-1. 四則演算",
    "description": "Python講座「1-1. 四則演算」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py11"
  },
  "py12": {
    "title": "1-2. 変数と画面出力",
    "description": "Python講座「1-2. 変数と画面出力」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py12"
  },
  "py21": {
    "title": "2-1. 条件分岐（if文）",
    "description": "Python講座「2-1. 条件分岐（if文）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py21"
  },
  "py22a": {
    "title": "2-2. 繰り返し（while文）① A基本問題",
    "description": "Python講座「2-2. 繰り返し（while文）① A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py22a"
  },
  "py22b": {
    "title": "2-2. 繰り返し（while文）① B応用問題",
    "description": "Python講座「2-2. 繰り返し（while文）① B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py22b"
  },
  "py23a": {
    "title": "2-3. 繰り返し（while文）② A基本問題",
    "description": "Python講座「2-3. 繰り返し（while文）② A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py23a"
  },
  "py23b": {
    "title": "2-3. 繰り返し（while文）② B応用問題",
    "description": "Python講座「2-3. 繰り返し（while文）② B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py23b"
  },
  "py24a": {
    "title": "2-4. 繰り返し（for文）① A基本問題",
    "description": "Python講座「2-4. 繰り返し（for文）① A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py24a"
  },
  "py24b": {
    "title": "2-4. 繰り返し（for文）① B応用問題",
    "description": "Python講座「2-4. 繰り返し（for文）① B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py24b"
  },
  "py25a": {
    "title": "2-5. 繰り返し（for文）② A基本問題",
    "description": "Python講座「2-5. 繰り返し（for文）② A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py25a"
  },
  "py25b": {
    "title": "2-5. 繰り返し（for文）② B応用問題",
    "description": "Python講座「2-5. 繰り返し（for文）② B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py25b"
  },
  "py31a": {
    "title": "3-1. リスト（list） A基本問題",
    "description": "Python講座「3-1. リスト（list） A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py31a"
  },
  "py31b": {
    "title": "3-1. リスト（list） B応用問題",
    "description": "Python講座「3-1. リスト（list） B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py31b"
  },
  "py32": {
    "title": "3-2. 関数定義（def文）",
    "description": "Python講座「3-2. 関数定義（def文）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py32"
  },
  "py33a": {
    "title": "3-3. 2次元リスト A基本問題",
    "description": "Python講座「3-3. 2次元リスト A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py33a"
  },
  "py33b": {
    "title": "3-3. 2次元リスト B応用問題",
    "description": "Python講座「3-3. 2次元リスト B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py33b"
  },
  "py41": {
    "title": "4-1. リニアサーチ（線形探索法）",
    "description": "Python講座「4-1. リニアサーチ（線形探索法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py41"
  },
  "py42": {
    "title": "4-2. バイナリサーチ（二分探索法）",
    "description": "Python講座「4-2. バイナリサーチ（二分探索法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py42"
  },
  "py43": {
    "title": "4-3. バブルソート（単純交換法）",
    "description": "Python講座「4-3. バブルソート（単純交換法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py43"
  },
  "py44": {
    "title": "4-4. 選択ソート（単純選択法）",
    "description": "Python講座「4-4. 選択ソート（単純選択法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py44"
  },
  "py45": {
    "title": "4-5. 挿入ソート（単純挿入法）",
    "description": "Python講座「4-5. 挿入ソート（単純挿入法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py45"
  },
  "py51": {
    "title": "5-1. グラフの表示",
    "description": "Python講座「5-1. グラフの表示」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py51"
  },
  "py52": {
    "title": "5-2. 確定モデル",
    "description": "Python講座「5-2. 確定モデル」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py52"
  },
  "py53": {
    "title": "5-3. 確率モデル",
    "description": "Python講座「5-3. 確率モデル」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py53"
  },
  "ipr01": {
    "title": "知的財産権と個人情報・プライバシー①",
    "description": "「知的財産権と個人情報・プライバシー①」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=ipr01"
  },
  "ipr02": {
    "title": "知的財産権と個人情報・プライバシー②",
    "description": "「知的財産権と個人情報・プライバシー②」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=ipr02"
  },
  "ipr03": {
    "title": "知的財産権と個人情報・プライバシー③",
    "description": "「知的財産権と個人情報・プライバシー③」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=ipr03"
  },
  "ipr_test": {
    "title": "知的財産権と個人情報・プライバシー_仮問題",
    "description": "知的財産権と個人情報・プライバシー_仮問題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=ipr_test"
  },
  "sec01": {
    "title": "情報セキュリティ①",
    "description": "「情報セキュリティ①」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=sec01"
  },
  "sec02": {
    "title": "情報セキュリティ②",
    "description": "「情報セキュリティ②」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=sec02"
  },
  "sec03": {
    "title": "情報セキュリティ③",
    "description": "「情報セキュリティ③」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=sec03"
  },
  "lc01": {
    "title": "論理回路①",
    "description": "「論理回路①」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc01"
  },
  "lc02": {
    "title": "論理回路②",
    "description": "「論理回路②」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc02"
  },
  "lc03": {
    "title": "論理回路③",
    "description": "「論理回路③」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc03"
  },
  "lc04": {
    "title": "論理回路④",
    "description": "「論理回路④」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc04"
  },
  "lc05": {
    "title": "論理回路⑤",
    "description": "「論理回路⑤」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc05"
  },
  "lc06": {
    "title": "論理回路⑥",
    "description": "「論理回路⑥」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc06"
  },
  "l11": {
    "title": "1-1. 情報とメディア",
    "description": "確認問題「1-1. 情報とメディア」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l11"
  },
  "l12": {
    "title": "1-2. 知的財産権（産業財産権）",
    "description": "確認問題「1-2. 知的財産権（産業財産権）」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l12"
  },
  "l13": {
    "title": "1-3. 知的財産権（著作権）",
    "description": "確認問題「1-3. 知的財産権（著作権）」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l13"
  },
  "l14": {
    "title": "1-4. 個人情報の保護と管理",
    "description": "確認問題「1-4. 個人情報の保護と管理」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l14"
  },
  "l15": {
    "title": "1-5. 不正アクセス",
    "description": "確認問題「1-5. 不正アクセス」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l15"
  },
  "l16": {
    "title": "1-6. 情報セキュリティ",
    "description": "確認問題「1-6. 情報セキュリティ」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l16"
  },
  "l17": {
    "title": "1-7. 問題解決の方法",
    "description": "確認問題「1-7. 問題解決の方法」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l17"
  },
  "l18": {
    "title": "1-8. 情報技術の進歩",
    "description": "確認問題「1-8. 情報技術の進歩」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l18"
  },
  "l19": {
    "title": "1-9. 情報技術の進歩による新たな問題",
    "description": "確認問題「1-9. 情報技術の進歩による新たな問題」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l19"
  },
  "l21": {
    "title": "2-1. コミュニケーション",
    "description": "確認問題「2-1. コミュニケーション」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l21"
  },
  "l22": {
    "title": "2-2. 情報デザイン",
    "description": "確認問題「2-2. 情報デザイン」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l22"
  },
  "l31": {
    "title": "3-1. アナログとデジタル",
    "description": "確認問題「3-1. アナログとデジタル」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l31"
  },
  "l32": {
    "title": "3-2. 2進法と16進法",
    "description": "確認問題「3-2. 2進法と16進法」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l32"
  },
  "l33": {
    "title": "3-3. 2進法の足し算・引き算",
    "description": "確認問題「3-3. 2進法の足し算・引き算」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l33"
  },
  "l34": {
    "title": "3-4. 文字のデジタル表現",
    "description": "確認問題「3-4. 文字のデジタル表現」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l34"
  },
  "l35": {
    "title": "3-5. 音のデジタル表現",
    "description": "確認問題「3-5. 音のデジタル表現」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l35"
  },
  "l36": {
    "title": "3-6. 画像のデジタル表現",
    "description": "確認問題「3-6. 画像のデジタル表現」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l36"
  },
  "l37": {
    "title": "3-7. 動画のデジタル表現",
    "description": "確認問題「3-7. 動画のデジタル表現」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l37"
  },
  "l38": {
    "title": "3-8. データの圧縮",
    "description": "確認問題「3-8. データの圧縮」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l38"
  },
  "l41": {
    "title": "4-1. コンピュータの構成",
    "description": "確認問題「4-1. コンピュータの構成」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l41"
  },
  "l42": {
    "title": "4-2. 論理回路",
    "description": "確認問題「4-2. 論理回路」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l42"
  },
  "l51": {
    "title": "5-1. プログラミング",
    "description": "確認問題「5-1. プログラミング」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l51"
  },
  "l52": {
    "title": "5-2. アルゴリズム",
    "description": "確認問題「5-2. アルゴリズム」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l52"
  },
  "l53": {
    "title": "5-3. モデル化とシミュレーション",
    "description": "確認問題「5-3. モデル化とシミュレーション」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l53"
  },
  "l61": {
    "title": "6-1. 情報通信ネットワークのしくみ",
    "description": "確認問題「6-1. 情報通信ネットワークのしくみ」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l61"
  },
  "l62": {
    "title": "6-2. プロトコル（第１〜３層）",
    "description": "確認問題「6-2. プロトコル（第１〜３層）」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l62"
  },
  "l63": {
    "title": "6-3. プロトコル（第４層：アプリケーション層）",
    "description": "確認問題「6-3. プロトコル（第４層：アプリケーション層）」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l63"
  },
  "l64": {
    "title": "6-4. 暗号化のしくみ",
    "description": "確認問題「6-4. 暗号化のしくみ」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l64"
  },
  "l65": {
    "title": "6-5. 情報システム",
    "description": "確認問題「6-5. 情報システム」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l65"
  },
  "l66": {
    "title": "6-6. データベース",
    "description": "確認問題「6-6. データベース」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l66"
  },
  "l71": {
    "title": "7-1. データの収集",
    "description": "確認問題「7-1. データの収集」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l71"
  },
  "l72": {
    "title": "7-2. データの活用",
    "description": "確認問題「7-2. データの活用」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l72"
  },
  "bin01": {
    "title": "2進数と10進数",
    "description": "「2進数と10進数」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=bin01"
  },
  "hex01": {
    "title": "16進数",
    "description": "「16進数」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=hex01"
  },
  "realn01": {
    "title": "固定小数点数と浮動小数点数",
    "description": "「固定小数点数と浮動小数点数」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=realn01"
  },
  "twoscmp01": {
    "title": "補数",
    "description": "「補数」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=twoscmp01"
  },
  "conv01": {
    "title": "換算",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=conv01"
  }
}
window.quizzes = quizzes

const submitForms = {
  "picto25": {
    "title": "ピクトグラム最終課題",
    "description": "中3 ピクトグラム実習最終課題の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=picto25"
  },
  "firefly25": {
    "title": "Firefly実習",
    "description": "中3 Firefly実習の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=firefly25"
  },
  "pysmr25": {
    "title": "Python夏休み自由製作",
    "description": "高1 Python実習 夏休み自由製作の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pysmr25"
  },
  "pysmr25q": {
    "title": "Python夏休み自由製作（グループ内）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pysmr25q"
  },
  "pysmr25f": {
    "title": "Python夏休み自由製作（全体）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pysmr25f"
  },
  "pywtr25": {
    "title": "Python冬休み自由製作",
    "description": "高1 Python実習 冬休み自由製作の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pywtr25"
  },
  "pywtr25q": {
    "title": "Python冬休み自由製作（グループ内）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pywtr25q"
  },
  "pywtr25f": {
    "title": "Python冬休み自由製作（全体）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pywtr25f"
  },
  "yuruchara25": {
    "title": "ゆるキャラ製作",
    "description": "中3 夏休み課題「ゆるキャラ製作」の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=yuruchara25"
  },
  "htmlp": {
    "title": "HTML実習",
    "description": "HTML実習の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=htmlp"
  },
  "htmlpic": {
    "title": "HTML実習 最終課題用写真",
    "description": "HTML実習の最終課題用の写真を提出するフォームです。\n- 撮影をしてきたかどうかの確認です。\n- 自分で撮影したものを1枚添付してください。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=htmlpic"
  },
  "htmlfin": {
    "title": "HTML実習 最終課題",
    "description": "HTML実習 最終課題の相互評価フォームです。",
    "url": ""
  }
}
window.submitForms = submitForms

const reviewForms = {
  "picto25": {
    "title": "ピクトグラム最終課題",
    "description": "中3 ピクトグラム実習最終課題の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=picto25"
  },
  "firefly25": {
    "title": "Firefly実習",
    "description": "中3 Firefly実習の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=firefly25"
  },
  "pysmr25": {
    "title": "Python夏休み自由製作",
    "description": "高1 Python実習 夏休み自由製作の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pysmr25"
  },
  "pysmr25q": {
    "title": "Python夏休み自由製作（グループ内）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pysmr25q"
  },
  "pysmr25f": {
    "title": "Python夏休み自由製作（全体）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pysmr25f"
  },
  "pywtr25": {
    "title": "Python冬休み自由製作",
    "description": "高1 Python実習 冬休み自由製作の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pywtr25"
  },
  "pywtr25q": {
    "title": "Python冬休み自由製作（グループ内）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pywtr25q"
  },
  "pywtr25f": {
    "title": "Python冬休み自由製作（全体）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pywtr25f"
  },
  "yuruchara25": {
    "title": "ゆるキャラ製作",
    "description": "中3 夏休み課題「ゆるキャラ製作」の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=yuruchara25"
  },
  "htmlp": {
    "title": "HTML実習",
    "description": "HTML実習の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=htmlp"
  },
  "htmlpic": {
    "title": "HTML実習 最終課題用写真",
    "description": "HTML実習の最終課題用の写真を提出するフォームです。\n- 撮影をしてきたかどうかの確認です。\n- 自分で撮影したものを1枚添付してください。",
    "url": ""
  },
  "htmlfin": {
    "title": "HTML実習 最終課題",
    "description": "HTML実習 最終課題の相互評価フォームです。",
    "url": ""
  }
}
window.reviewForms = reviewForms

const pubFiles = {
  "lc12": {
    "title": "LC12_知的財産権制度と個人情報・プライバシー",
    "description": "",
    "url": "https://docs.google.com/presentation/d/1XswHZwjz39pZgm7_UeDkUWg1o2YmgVmiHPnxMqQnwQQ/view?usp=drivesdk"
  },
  "lc13": {
    "title": "LC13_情報セキュリティ",
    "description": "",
    "url": "https://docs.google.com/presentation/d/1D3r7ppFOfkH4X80NINnde4pzmX4730zH26OvgL1bNFs/view?usp=drivesdk"
  }
}
window.pubFiles = pubFiles

const notices = {
  "noti_ori3": {
    "title": "情報の授業について中3",
    "description": "情報の授業について中3",
    "url": "https://docs.google.com/presentation/d/1DcvbpBRxV5cLzO888sG6vmBi_TWvH1OA0ijyQmcY0jo/edit?usp=drivesdk"
  },
  "noti_ori4": {
    "title": "情報の授業について高1",
    "description": "情報の授業について高1",
    "url": "https://docs.google.com/presentation/d/1WBxMjmE6O3_VwZ6Swq4zDb5MLnIBiLbwfGMOJqd3GcA/edit?usp=drivesdk"
  },
  "noti_htmlpicture": {
    "title": "中3_修学旅行での素材集めについて",
    "description": "2024-10_中3_修学旅行での素材集めについて",
    "url": "https://docs.google.com/document/d/1HX5GqFfmobKCqb3tPePWG9IuRPos8yUFgT7hF1R8gAM/edit?usp=drivesdk"
  },
  "noti_hw_wtr4": {
    "title": "高1_冬休みの宿題",
    "description": "2024-12_高1_冬休みの宿題",
    "url": "https://docs.google.com/document/d/14X1uGBHd2X4tLW-UaHR-6_IX8OHbvdtjb0HD3EZINi0/edit?usp=drivesdk"
  },
  "noti_hw_html": {
    "title": "HTML最終課題の提出",
    "description": "HTML最終課題の提出",
    "url": "https://docs.google.com/presentation/d/107suvqG5EMDPoG428EyPlOIni8EkYAS9i3wOMlxjuP8/edit?usp=drivesdk"
  },
  "noti_hw_wtr3": {
    "title": "中3_HTML実習最終課題（冬休みの宿題）",
    "description": "2024-11_中3_HTML実習最終課題（冬休みの宿題）",
    "url": "https://docs.google.com/document/d/1zUbnH1Li4gzoSCc99tQWuHX2UJVbjM8AGcnZVvQNkUI/edit?usp=drivesdk"
  },
  "noti_temp_gene-ai": {
    "title": "生成AI指針テンプレ",
    "description": "生成AI指針テンプレ",
    "url": "https://docs.google.com/document/d/18C7jqZzge9PPf55VPpwRGDNowAp4Ug5i-RHvNgkYMdI/edit?usp=drivesdk"
  },
  "noti_hw_feb4": {
    "title": "2025-01_高1_入試期間中の宿題",
    "description": "2025-01_高1_入試期間中の宿題",
    "url": "https://docs.google.com/document/d/1ySgJjtn7fCfeHnR-HnWjCFDQf0z2-G_F_9Z6F34eRD0/edit?usp=drivesdk"
  },
  "hw3_data": {
    "title": "中3_データの分析_最終課題",
    "description": "2025-02_中3_データの分析_最終課題",
    "url": "https://docs.google.com/document/d/19sKZqGnCX6BfwyFn1IVad-PQQdRpzZ9gHrg9axs4yno/edit?usp=drivesdk"
  },
  "noti_hw_picto": {
    "title": "中3_1学期_ピクトグラム最終課題",
    "description": "中3_1学期_ピクトグラム最終課題",
    "url": "https://docs.google.com/document/d/1t3uv7xG2a-ff5nLCGn-GhXL7af_Za_z6-Y8TQ33Yr5I/edit?usp=drivesdk"
  },
  "noti_hw_smr3": {
    "title": "2025-07_中3_夏休みの宿題",
    "description": "2025-07_中3_夏休みの宿題",
    "url": "https://docs.google.com/document/d/119LV80dwLuLewl-0uarLLyJ55AwPhYCiYQDtmTiPC80/edit?usp=drivesdk"
  },
  "noti_hw_smr4": {
    "title": "2025-07_高1_夏休みの宿題",
    "description": "2025-07_高1_夏休みの宿題",
    "url": "https://docs.google.com/document/d/1VTMZ2CIo2FdJJ1N_iPiLtkUXyIjr0MHKXFSuEctWM7Y/edit?usp=drivesdk"
  },
  "noti_firefly": {
    "title": "Firefly実習",
    "description": "Firefly実習",
    "url": "https://docs.google.com/presentation/d/16By_P147zDyW7M-tUvoxgQiqH3lPgE7nx2whXNFciqk/edit?usp=drivesdk"
  }
}
window.notices = notices

const typing = {
  "L1": {
    "title": "ホームキー基礎（ASDFGHJKL）",
    "description": "ホーム段のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L1"
  },
  "L2": {
    "title": "上段＋ホーム（QWERTYUIOP + ASDFGHJKL）",
    "description": "ホーム段＋上段のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L2"
  },
  "L3": {
    "title": "全英字（A–Z）",
    "description": "英字全段（ホーム段＋上段＋下段）のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L3"
  },
  "L4": {
    "title": "長音(ー)を含む語",
    "description": "英字＋数字キー（ホーム段＋上段＋下段＋ハイフン）のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L4"
  },
  "L5": {
    "title": "英字＋数字（A–Z + 0–9）",
    "description": "英字＋数字キー（ホーム段＋上段＋下段＋数字キー）のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L5"
  },
  "L6": {
    "title": "実用的な文字列の入力",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L6"
  },
  "K1": {
    "title": "鬼滅 基本名詞（短め）",
    "description": "人物名・基本用語（短め）。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=K1"
  },
  "K2": {
    "title": "鬼滅 固有名詞（中〜長め）",
    "description": "フルネーム/地名/編名など中〜長め。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=K2"
  },
  "K3": {
    "title": "呼吸・型名（技）",
    "description": "各呼吸の技名を連結入力（記号・中黒は入力不要）。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=K3"
  },
  "HY1": {
    "title": "百人一首 1–20（全句）",
    "description": "百人一首（スペースは入力不要）",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY1"
  },
  "HY2": {
    "title": "百人一首 21–40（全句）",
    "description": "同上。中難度。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY2"
  },
  "HY3": {
    "title": "百人一首 41–60（全句）",
    "description": "同上。やや長め多め。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY3"
  },
  "HY4": {
    "title": "百人一首 61–80（全句）",
    "description": "同上。長文・歴史仮名多め。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY4"
  },
  "HY5": {
    "title": "百人一首 81–100（全句）",
    "description": "同上。長文中心。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY5"
  }
}
window.typing = typing

const files = {
  "---": {
    "title": "SS1-3_課題（解答）《旧バージョン》",
    "description": "",
    "url": ""
  },
  "noti_ori3": {
    "title": "情報の授業について中3",
    "description": "情報の授業について中3",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_ori3"
  },
  "noti_ori4": {
    "title": "情報の授業について高1",
    "description": "情報の授業について高1",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_ori4"
  },
  "py_kadai01": {
    "title": "夏休みの課題.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py_kadai01"
  },
  "py_kadai02": {
    "title": "冬休みの課題.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py_kadai02"
  },
  "py02nb": {
    "title": "実習のはじめかた ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py02nb"
  },
  "py11nb": {
    "title": "1-1. 数値演算 ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py11nb"
  },
  "py12nb": {
    "title": "1-2. 変数と画面出力 ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py12nb"
  },
  "py13nb": {
    "title": "1-3. 関数 ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py13nb"
  },
  "py21a": {
    "title": "2-1_条件分岐（if文）_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py21a"
  },
  "py21b": {
    "title": "2-1_条件分岐（if文）_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py21b"
  },
  "py21nb": {
    "title": "2-1. 条件分岐（if文） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py21nb"
  },
  "py22a": {
    "title": "2-2_繰り返し処理（while文）①_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py22a"
  },
  "py22b": {
    "title": "2-2_繰り返し処理（while文）①_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py22b"
  },
  "py22nb": {
    "title": "2-2. 繰り返し処理（while文）① ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py22nb"
  },
  "py23a": {
    "title": "2-3_繰り返し処理（while文）②_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py23a"
  },
  "py23b": {
    "title": "2-3_繰り返し処理（while文）②_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py23b"
  },
  "py23nb": {
    "title": "2-3. 繰り返し処理（while文）② ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py23nb"
  },
  "py24a": {
    "title": "2-4_繰り返し処理（for文）①_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py24a"
  },
  "py24b": {
    "title": "2-4_繰り返し処理（for文）①_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py24b"
  },
  "py24nb": {
    "title": "2-4. 繰り返し処理（for文）① ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py24nb"
  },
  "py25a": {
    "title": "2-5_繰り返し処理（for文）②_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py25a"
  },
  "py25b": {
    "title": "2-5_繰り返し処理（for文）②_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py25b"
  },
  "py25nb": {
    "title": "2-5. 繰り返し処理（for文）② ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py25nb"
  },
  "py31a": {
    "title": "3-1_リスト（list）_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py31a"
  },
  "py31b": {
    "title": "3-1_リスト（list）_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py31b"
  },
  "py31nb": {
    "title": "3-1. リスト（list） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py31nb"
  },
  "py32a": {
    "title": "3-2_関数定義（def文）_問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py32a"
  },
  "py32nb": {
    "title": "3-2. 関数定義（def文） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py32nb"
  },
  "py33a": {
    "title": "3-3_２次元リスト_問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py33a"
  },
  "py33nb": {
    "title": "3-3. 2次元リスト ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py33nb"
  },
  "py34nb": {
    "title": "3-4. 辞書（dictionary） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py34nb"
  },
  "py35nb": {
    "title": "3-5. ファイルの入出力 ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py35nb"
  },
  "py41a": {
    "title": "4-1_リニアサーチ_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py41a"
  },
  "py41nb": {
    "title": "4-1. リニアサーチ（線形探索法） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py41nb"
  },
  "py42a": {
    "title": "4-2_バイナリサーチ_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py42a"
  },
  "py42nb": {
    "title": "4-2. バイナリサーチ（二分探索法） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py42nb"
  },
  "py43a": {
    "title": "4-3_バブルソート_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py43a"
  },
  "py43nb": {
    "title": "4-3. バブルソート（単純交換法） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py43nb"
  },
  "py44a": {
    "title": "4-4_選択ソート_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py44a"
  },
  "py44nb": {
    "title": "4-4. 選択ソート（単純選択法） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py44nb"
  },
  "py45a": {
    "title": "4-5_挿入ソート_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py45a"
  },
  "py45nb": {
    "title": "4-5. 挿入ソート（単純挿入法） ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py45nb"
  },
  "py46nb": {
    "title": "4-6. クイックソート ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py46nb"
  },
  "py51nb": {
    "title": "5-1. グラフの表示 ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py51nb"
  },
  "py52nb": {
    "title": "5-2. 確定モデル ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py52nb"
  },
  "py53nb": {
    "title": "5-3. 確率モデル ノートブック.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py53nb"
  },
  "pysample": {
    "title": "sample.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=pysample"
  },
  "ss11t": {
    "title": "SS1-1_課題（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss11t"
  },
  "ss11w": {
    "title": "SS1-1_実習_四則演算",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss11w"
  },
  "ss12t": {
    "title": "SS1-2_課題（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss12t"
  },
  "ss12w": {
    "title": "SS1-2_実習_表計算の基礎",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss12w"
  },
  "ss13t": {
    "title": "SS1-3_課題（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss13t"
  },
  "ss13w": {
    "title": "SS1-3_実習_関数の基礎",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss13w"
  },
  "ss14t": {
    "title": "SS1-4_課題（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss14t"
  },
  "ss14w": {
    "title": "SS1-4_実習_相対参照と絶対参照",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss14w"
  },
  "ss15t": {
    "title": "SS1-5_課題（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss15t"
  },
  "ss15w": {
    "title": "SS1-5_実習_グラフ_気温と降水量",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss15w"
  },
  "ss15wa": {
    "title": "SS1-5_実習_グラフ_気温と降水量（解答）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss15wa"
  },
  "ss21t": {
    "title": "SS2-1_課題",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss21t"
  },
  "ss21ta": {
    "title": "SS2-1_課題（解答）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss21ta"
  },
  "ss21w": {
    "title": "SS2-1_例題",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss21w"
  },
  "ss22t": {
    "title": "SS2-2_課題",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss22t"
  },
  "ss22ta": {
    "title": "SS2-2_課題（解答）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss22ta"
  },
  "ss22w": {
    "title": "SS2-2_例題",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss22w"
  },
  "ss31w": {
    "title": "SS3-1_実習",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss31w"
  },
  "ss32w": {
    "title": "SS3-2_実習",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss32w"
  },
  "ss33w": {
    "title": "SS3-3_実習",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss33w"
  },
  "ss34w": {
    "title": "SS3-4_演習１_アイスクリームとエアコン",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss34w"
  },
  "ss35w": {
    "title": "SS3-5_演習２_Irisデータセット",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss35w"
  },
  "ss39_kadai": {
    "title": "SS3-9_課題データセット",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss39_kadai"
  },
  "ss39_report_a": {
    "title": "SS3-9_データの分析最終課題_提出用レポートA",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss39_report_a"
  },
  "ss39_report_b": {
    "title": "SS3-9_データの分析最終課題_提出用レポートB",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss39_report_b"
  },
  "ss39_report_c1": {
    "title": "SS3-9_データの分析最終課題_提出用レポートC1",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss39_report_c1"
  },
  "ss39_report_c2": {
    "title": "SS3-9_データの分析最終課題_提出用レポートC2",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss39_report_c2"
  },
  "ss39_report_c3": {
    "title": "SS3-9_データの分析最終課題_提出用レポートC3",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss39_report_c3"
  },
  "ss39_ss": {
    "title": "SS3-9_データの分析最終課題_提出用スプレッドシート",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss39_ss"
  },
  "ss41s": {
    "title": "SS4-1_演習1_レジの待ち行列（ワークシート説明スライド）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss41s"
  },
  "ss41w": {
    "title": "SS4-1_演習1_レジの待ち行列",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss41w"
  },
  "ss41wa": {
    "title": "SS4-1_演習1_レジの待ち行列（解答）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss41wa"
  },
  "ss41ws": {
    "title": "SS4-1_演習1_レジの待ち行列（ワークシート）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss41ws"
  },
  "test1": {
    "title": "テンプレテスト1xxx",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=test1"
  },
  "test2": {
    "title": "テンプレテスト2",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=test2"
  },
  "test3": {
    "title": "テンプレテスト3",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=test3"
  },
  "test4": {
    "title": "テンプレテスト4",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=test4"
  },
  "test5": {
    "title": "テンプレテスト5",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=test5"
  },
  "test6": {
    "title": "テンプレテスト6",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=test6"
  },
  "": {
    "title": "2025中3_2学期期末考査試験範囲",
    "description": "",
    "url": ""
  },
  "noti_htmlpicture": {
    "title": "中3_修学旅行での素材集めについて",
    "description": "2024-10_中3_修学旅行での素材集めについて",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_htmlpicture"
  },
  "noti_hw_wtr4": {
    "title": "高1_冬休みの宿題",
    "description": "2024-12_高1_冬休みの宿題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_wtr4"
  },
  "noti_hw_html": {
    "title": "HTML最終課題の提出",
    "description": "HTML最終課題の提出",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_html"
  },
  "noti_hw_wtr3": {
    "title": "中3_HTML実習最終課題（冬休みの宿題）",
    "description": "2024-11_中3_HTML実習最終課題（冬休みの宿題）",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_wtr3"
  },
  "noti_temp_gene-ai": {
    "title": "生成AI指針テンプレ",
    "description": "生成AI指針テンプレ",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_temp_gene-ai"
  },
  "noti_hw_feb4": {
    "title": "2025-01_高1_入試期間中の宿題",
    "description": "2025-01_高1_入試期間中の宿題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_feb4"
  },
  "hw3_data": {
    "title": "中3_データの分析_最終課題",
    "description": "2025-02_中3_データの分析_最終課題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=hw3_data"
  },
  "noti_hw_picto": {
    "title": "中3_1学期_ピクトグラム最終課題",
    "description": "中3_1学期_ピクトグラム最終課題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_picto"
  },
  "test": {
    "title": "提出スクリプトのテスト用",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=test"
  },
  "noti_hw_smr3": {
    "title": "2025-07_中3_夏休みの宿題",
    "description": "2025-07_中3_夏休みの宿題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_smr3"
  },
  "noti_hw_smr4": {
    "title": "2025-07_高1_夏休みの宿題",
    "description": "2025-07_高1_夏休みの宿題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_smr4"
  },
  "noti_firefly": {
    "title": "Firefly実習",
    "description": "Firefly実習",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_firefly"
  },
  "py51a": {
    "title": "5-1_グラフの表示_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py51a"
  },
  "py52a": {
    "title": "5-2_確定モデル_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py52a"
  },
  "py53a": {
    "title": "5-3_確率モデル_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=py53a"
  },
  "ss41t": {
    "title": "SS4-1_演習_レジの待ち行列（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss41t"
  },
  "ss31t": {
    "title": "SS3-1_課題（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss31t"
  },
  "ss32t": {
    "title": "SS3-2_課題（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss32t"
  },
  "ss33t": {
    "title": "SS3-3_課題（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss33t"
  },
  "ss34t": {
    "title": "SS3-4_課題_アイスクリームとエアコン（問題）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=ss34t"
  }
}
window.files = files

const urls = {
  "attendance": {
    "title": "",
    "description": "出欠状況確認",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbyLdvmDDW8wHjQA_JLe4eE_lvnLQmTSQ1skWxjRGJ1WjlUyIJ7_dFk8KmtZDU-bwQ/exec"
  },
  "htmlfinsubm": {
    "title": "",
    "description": "HTML最終課題 提出方法",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbzMZ_7lqx9A4eyMNJUBjG68Xbbo96H2fCpQKSYbu3VfNpKTHKQf74WFAZVjd25k100_/exec"
  }
}
window.urls = urls
