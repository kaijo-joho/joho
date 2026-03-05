const update = '2026-03-05 11:05:50';

const quizzes = {};
window.quizzes = quizzes;

const submitForms = {};
window.submitForms = submitForms;

const reviewForms = {};
window.reviewForms = reviewForms;

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
};
window.pubFiles = pubFiles;

const notices = {
  "hw3_data": {
    "title": "中3_データの分析_最終課題",
    "description": "2025-02_中3_データの分析_最終課題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=hw3_data"
  },
  "hw3_exam": {
    "title": "中3_入試期間中の課題",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=hw3_exam"
  },
  "hw4_exam": {
    "title": "高1_入試期間中の宿題",
    "description": "2025-01_高1_入試期間中の宿題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=hw4_exam"
  },
  "noti_firefly": {
    "title": "Firefly実習",
    "description": "Firefly実習",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_firefly"
  },
  "noti_htmlpicture": {
    "title": "中3_修学旅行での素材集めについて",
    "description": "2024-10_中3_修学旅行での素材集めについて",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_htmlpicture"
  },
  "noti_hw_html": {
    "title": "HTML最終課題の提出",
    "description": "HTML最終課題の提出",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_html"
  },
  "noti_hw_picto": {
    "title": "中3_1学期_ピクトグラム最終課題",
    "description": "中3_1学期_ピクトグラム最終課題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_picto"
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
  "noti_hw_wtr3": {
    "title": "中3_HTML実習最終課題（冬休みの宿題）",
    "description": "2024-11_中3_HTML実習最終課題（冬休みの宿題）",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_wtr3"
  },
  "noti_hw_wtr4": {
    "title": "高1_冬休みの宿題",
    "description": "2024-12_高1_冬休みの宿題",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_hw_wtr4"
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
  "noti_temp_gene-ai": {
    "title": "生成AI指針テンプレ",
    "description": "生成AI指針テンプレ",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycby-xnqeze89LX6r1ajacHONDedPIwKUOB-VkR5wcrV0x0-SakJmljeXlNOuGL5bRI3zTw/exec?type=file&target=noti_temp_gene-ai"
  }
};
window.notices = notices;

const typing = {};
window.typing = typing;

const files = {
  "---": {
    "title": "SS1-3_課題（解答）《旧バージョン》",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1HUrRGj1tjE8Gp8ovLMu7IuyfzCNscw9Ua6Xrk10YiKc/edit?usp=drivesdk"
  },
  "py_kadai01": {
    "title": "夏休みの課題.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1Fc1MP1BkUD9Q4lJcR5R49Y2wNLzZzAb_"
  },
  "py_kadai02": {
    "title": "冬休みの課題.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1kwKoVugw56hkfmY6YtfSNN1cVFcoZfM4"
  },
  "py02nb": {
    "title": "実習のはじめかた ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1KnoYER3uUKh9dVum1i--UOQCgdz-1qFd"
  },
  "py11nb": {
    "title": "1-1. 数値演算 ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1b7oimwhDkSqvvCkohZY-DCWRvfjDTzT0"
  },
  "py12nb": {
    "title": "1-2. 変数と画面出力 ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1Y_GP88sJT4P9T625QOBmyswi8ag2FB8a"
  },
  "py13nb": {
    "title": "1-3. 関数 ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1052hNRvbAk_d29mNJxREkUD3FQFBQUG4"
  },
  "py21a": {
    "title": "2-1_条件分岐（if文）_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1AxwKwSNmMF6VwEravb97xtKV5dP0-BXu"
  },
  "py21b": {
    "title": "2-1_条件分岐（if文）_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1MkQM3zs1VsXjEvHy_kKY7dXTUInEArTJ"
  },
  "py21nb": {
    "title": "2-1. 条件分岐（if文） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1U9QmqwhQEgPUzBedQ5YZzYHUjSUPNabH"
  },
  "py22a": {
    "title": "2-2_繰り返し処理（while文）①_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1peI5SjrTq5LioDE4dlGaJAq06iBcrPVF"
  },
  "py22b": {
    "title": "2-2_繰り返し処理（while文）①_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1SCvmMNVCuH6iFdXgnvmV-NvlzCVKAA1x"
  },
  "py22nb": {
    "title": "2-2. 繰り返し処理（while文）① ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1Rl23QddXJkUy-XxkhlOxg1cDbIj7FJRV"
  },
  "py23a": {
    "title": "2-3_繰り返し処理（while文）②_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1RBtYWfsav30zqO4va9uaBq5jJIKjEqJu"
  },
  "py23b": {
    "title": "2-3_繰り返し処理（while文）②_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/15Tw3FmhqfHJdAfpvsOxGA_oBqVXoydwg"
  },
  "py23nb": {
    "title": "2-3. 繰り返し処理（while文）② ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/14Hukn8YEv4DPk6rnEUjVIsjl8VcE9Z9a"
  },
  "py24a": {
    "title": "2-4_繰り返し処理（for文）①_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1JbSwsqabKZlB9yZ8JqmMDKhfrU5HDHfa"
  },
  "py24b": {
    "title": "2-4_繰り返し処理（for文）①_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1bsUrn5VvJDa38SBLLmF4vI4lA7QQKWY_"
  },
  "py24nb": {
    "title": "2-4. 繰り返し処理（for文）① ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1VlouHDiTJ3AnA_ctJ0bcYNFspQvU5zol"
  },
  "py25a": {
    "title": "2-5_繰り返し処理（for文）②_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1UbSFMb9xjpwtpApw8o3OJi4aazRta8b9"
  },
  "py25b": {
    "title": "2-5_繰り返し処理（for文）②_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1uZpvzAeltwddsKEWiQPBD34ajpvi0E6R"
  },
  "py25nb": {
    "title": "2-5. 繰り返し処理（for文）② ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1Cj6THd6tv4nFtrs8OzXi9BG4Tp1L7jSC"
  },
  "py31a": {
    "title": "3-1_リスト（list）_A基本問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1PBmkjcySJ2UO3PTlTEe5w91JcqZR44No"
  },
  "py31b": {
    "title": "3-1_リスト（list）_B応用問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/13MagoUPs5NibAwppdQES868tYKLnDpwb"
  },
  "py31nb": {
    "title": "3-1. リスト（list） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/12CoSUO7usW_b3JhnY54xC9RZ0DjC1L5i"
  },
  "py32a": {
    "title": "3-2_関数定義（def文）_問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1MNdPM4ZeOhuFpnKo6oxBoM1e1nXnrNOE"
  },
  "py32nb": {
    "title": "3-2. 関数定義（def文） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/189j6jRGaa2DijT1mdiWHk8xCzIr78MQi"
  },
  "py33a": {
    "title": "3-3_２次元リスト_問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1V9g0ltpaifXLs7WOFgzzJ9qXMaxkFJvC"
  },
  "py33nb": {
    "title": "3-3. 2次元リスト ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1lo5sUlQd5UmAVWF8jEC6JMb363ktITf7"
  },
  "py34nb": {
    "title": "3-4. 辞書（dictionary） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1FuJUu2dOHshLvFSBpQ8SqNOn0JhT0T-t"
  },
  "py35nb": {
    "title": "3-5. ファイルの入出力 ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1JIWydKss_BrtORcukBX222vN8w-dfAD7"
  },
  "py41a": {
    "title": "4-1_リニアサーチ_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1de0-usc69RmGALioq1noJKPf8x5WeM7t"
  },
  "py41nb": {
    "title": "4-1. リニアサーチ（線形探索法） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1sP1JM7gthXvWljyv5hT2wYe2mV9w8kQc"
  },
  "py42a": {
    "title": "4-2_バイナリサーチ_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1tXJf1f_LjQGITwOdpF77FL9Xuu3zPs8f"
  },
  "py42nb": {
    "title": "4-2. バイナリサーチ（二分探索法） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1zVZOVEJDGm1V09DWjle7dsB1E2WJZ-bm"
  },
  "py43a": {
    "title": "4-3_バブルソート_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/19CmI-UUye08HMhu5As9Bii4PuI7hmTau"
  },
  "py43nb": {
    "title": "4-3. バブルソート（単純交換法） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1zW0IW9lTihM3ruvaL9-iQ-EwM9vhs9g_"
  },
  "py44a": {
    "title": "4-4_選択ソート_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1tMjs-pZBUPv1vzWvZf8WUSq5lIgtz2pQ"
  },
  "py44nb": {
    "title": "4-4. 選択ソート（単純選択法） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1BYLr18u5hWJwsuSMzuKy8d7bz2H3OeDQ"
  },
  "py45a": {
    "title": "4-5_挿入ソート_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1wGGU7K-cFbJEhLQvkBMizFE8EjRMeLpd"
  },
  "py45nb": {
    "title": "4-5. 挿入ソート（単純挿入法） ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/14rhEW0hm4RkpIEZFiC1m5rzjuQ_fttH3"
  },
  "py46nb": {
    "title": "4-6. クイックソート ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1lPisdUD7_-ROt5ltMaI5pStL-CmPQxpS"
  },
  "py51a": {
    "title": "5-1_グラフの表示_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1Vr4di6sLzSsodlkIiB4otuqg8Bf-iCja"
  },
  "py51nb": {
    "title": "5-1. グラフの表示 ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1xngAUPhzfHg_7R3YZn3T4l2b6UzIJ6bs"
  },
  "py52a": {
    "title": "5-2_確定モデル_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1hG30S9f8PILfylRjfncwPwsFYogdOE5b"
  },
  "py52nb": {
    "title": "5-2. 確定モデル ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1Z8SzHEaU3c9xUzFefUK0dJaCVMPHnQ1r"
  },
  "py53a": {
    "title": "5-3_確率モデル_演習問題（問題）.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1i1l_Y_vy0U-DxPs3jKZJAxOBJKVAsrWh"
  },
  "py53nb": {
    "title": "5-3. 確率モデル ノートブック.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/13VaBvumEsOaxfF9M90DgCYCebxR2mcYQ"
  },
  "pysample": {
    "title": "sample.ipynb",
    "description": "",
    "url": "https://colab.research.google.com/drive/1eXrbXZaW57pvGFqLm7stBHlqwQiekzRK"
  },
  "ss11t": {
    "title": "SS1-1_課題（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1eSSqsQ4dCB2DiYv6_2n_WAL1aXIKrOWGRhuBtodpzOs/edit?usp=drivesdk"
  },
  "ss11w": {
    "title": "SS1-1_実習_四則演算",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1KE8KXDr6Gmm8eDpp8jwViH2dMV6OASYug0TFP1pcLHs/edit?usp=drivesdk"
  },
  "ss12t": {
    "title": "SS1-2_課題（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1zVovM_3lNY90sSxOaODNYPS00Kf67HiG3igaoz_B0-E/edit?usp=drivesdk"
  },
  "ss12w": {
    "title": "SS1-2_実習_表計算の基礎",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1Eh_lQLdhSkgVnqEOQ4VOqw7btlQrGZuH6ShoNXwzPrs/edit?usp=drivesdk"
  },
  "ss13t": {
    "title": "SS1-3_課題（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/12EhZGak5dISP_Du4fTwTGqe6_vC6mX-Oe_hph2g3u1U/edit?usp=drivesdk"
  },
  "ss13w": {
    "title": "SS1-3_実習_関数の基礎",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1eCkUXGxehmUNMjEA4EE8Mq4g4hhqLokvyNNoPI9zL0Q/edit?usp=drivesdk"
  },
  "ss14t": {
    "title": "SS1-4_課題（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1Jr8R0P9bB0mJoZe80mUtKp6TfgUn18mLEplMnJtTn9s/edit?usp=drivesdk"
  },
  "ss14w": {
    "title": "SS1-4_実習_相対参照と絶対参照",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1LTqjTgRIcnVcYeGd59y8dMjIHdEWRvl5Q-K4fhz9kzo/edit?usp=drivesdk"
  },
  "ss15t": {
    "title": "SS1-5_課題（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/10J04HQP7nD_ffsXrAEO5t54b_WxVxvL7eOp7eJ0kWw4/edit?usp=drivesdk"
  },
  "ss15w": {
    "title": "SS1-5_実習_グラフ_気温と降水量",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1t9mHk3_ehsYwi2OioPvH2T0HFM9TmnbEQjVQQHrDaHc/edit?usp=drivesdk"
  },
  "ss15wa": {
    "title": "SS1-5_実習_グラフ_気温と降水量（解答）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1narhZiK2JLCDU3I77jCWqWIJfClNSh-jVRnohXp7G7U/edit?usp=drivesdk"
  },
  "ss21t": {
    "title": "SS2-1_課題",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1i6WZ1HCCcdisrBC5_-BeNXDzPTU-Itd1EyPX-Wy3OKw/edit?usp=drivesdk"
  },
  "ss21ta": {
    "title": "SS2-1_課題（解答）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1qxSARCzM7rDVOXxKaHNMzo7cY7Iw6x6VKisO2r66DaQ/edit?usp=drivesdk"
  },
  "ss21w": {
    "title": "SS2-1_例題",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1CYU55YELtXDRs9bbUSF1G8rV70pr30rzgq0XmwrFM-4/edit?usp=drivesdk"
  },
  "ss22t": {
    "title": "SS2-2_課題",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1QOUWIromlDxc-yjj4chGLoJipwcLQfnA4a3Y9rhFJyA/edit?usp=drivesdk"
  },
  "ss22ta": {
    "title": "SS2-2_課題（解答）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1aIOT_lgwfU2Ab3zyLmBtQ60I9aHZlr1s5wx05FYrFhk/edit?usp=drivesdk"
  },
  "ss22w": {
    "title": "SS2-2_例題",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1FieJBDBZQcKp14UpD-7CPYYopTE6SvvtZ0qHeWVo1bo/edit?usp=drivesdk"
  },
  "ss31t": {
    "title": "SS3-1_課題（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/161SYGnCpM51QC1EqyUKihVP-25Sv7azgJUKzzcHXqsM/edit?usp=drivesdk"
  },
  "ss31w": {
    "title": "SS3-1_実習",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1HmAXQ0VMp6cMPzQ8Jrt17zpYN_hJ-RQ7m1PqPhPTOZ0/edit?usp=drivesdk"
  },
  "ss32t": {
    "title": "SS3-2_課題（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1GFxDYt1dG9CQEZh679p_CAKEDvJkjA9fZLkg4qmqrdQ/edit?usp=drivesdk"
  },
  "ss32w": {
    "title": "SS3-2_実習",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1Eyh5SPq4YyvJJVkxe4TwojPYzbjzjngCgWr2yM6uNCs/edit?usp=drivesdk"
  },
  "ss33t": {
    "title": "SS3-3_課題（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1hpzG1IbnMcw8ExsJFrnATOgdYGVSd4twOjK43v9dOz0/edit?usp=drivesdk"
  },
  "ss33w": {
    "title": "SS3-3_実習",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1npfdljRM6panwB6fywlnrTlVXh202edgZlEsoKjYSV0/edit?usp=drivesdk"
  },
  "ss34t": {
    "title": "SS3-4_課題_アイスクリームとエアコン（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1nvB6USxtslAo-kre1DubhuMS3Q8I76WjzslCZX5RNgY/edit?usp=drivesdk"
  },
  "ss34w": {
    "title": "SS3-4_演習１_アイスクリームとエアコン",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1N91816Y-rc7Cew9EVqKEOEXqCMvUogKAsWdN482C3PY/edit?usp=drivesdk"
  },
  "ss35w": {
    "title": "SS3-5_演習２_Irisデータセット",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1tZyhrcbkSingCW9YvJMyFUjqSiXXTFfO6dKr3_gV-VU/edit?usp=drivesdk"
  },
  "ss39_kadai": {
    "title": "SS3-9_課題データセット",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1CpquGfRcrgwJKdRhg19f6zl9AK2cSVMe8Qnx5PS43n8/edit?usp=drivesdk"
  },
  "ss39_report_a": {
    "title": "SS3-9_データの分析最終課題_提出用レポートA",
    "description": "",
    "url": "https://docs.google.com/document/d/1s8zWgJerj3IURTD_N3OrzaUcaEN0WepoNtOmAepvam4/edit?usp=drivesdk"
  },
  "ss39_report_b": {
    "title": "SS3-9_データの分析最終課題_提出用レポートB",
    "description": "",
    "url": "https://docs.google.com/document/d/1tVzoznMbQQAd4e7dYtDVngUxQJZAEQnVLNs8L23sMy4/edit?usp=drivesdk"
  },
  "ss39_report_c": {
    "title": "SS3-9_データの分析最終課題_提出用レポートC",
    "description": "",
    "url": "https://docs.google.com/document/d/1_lpjLeZhJBB0_JfndajbXAKIOHHcRm8tUombrivBmAY/edit?usp=drivesdk"
  },
  "ss39_report_d1": {
    "title": "SS3-9_データの分析最終課題_提出用レポートD1",
    "description": "",
    "url": "https://docs.google.com/document/d/1sFeeF1zen1qScH8w7CYWcY5XJfxcDZMFV94CEzG1_VA/edit?usp=drivesdk"
  },
  "ss39_report_d2": {
    "title": "SS3-9_データの分析最終課題_提出用レポートD2",
    "description": "",
    "url": "https://docs.google.com/document/d/1mo54-Y2rBqzE80PBKcFN4JrqtlYax8jEfK3GV0vH7zs/edit?usp=drivesdk"
  },
  "ss39_report_d3": {
    "title": "SS3-9_データの分析最終課題_提出用レポートD3",
    "description": "",
    "url": "https://docs.google.com/document/d/1015y3JvA4pokB2EjqP9sEj09pMK81A-C1PU2UBPA2aQ/edit?usp=drivesdk"
  },
  "ss39_ss": {
    "title": "SS3-9_データの分析最終課題_提出用スプレッドシート",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1oADbFmtKpzpzP0LXpfc0xeFbXevXLYkqsonzlbNPDlY/edit?usp=drivesdk"
  },
  "ss41s": {
    "title": "SS4-1_演習1_レジの待ち行列（ワークシート説明スライド）",
    "description": "",
    "url": "https://docs.google.com/presentation/d/1Lk8B99hMJIm3qeg4DV5kPzEchUsvnmVX1HyjW3NtSr4/edit?usp=drivesdk"
  },
  "ss41t": {
    "title": "SS4-1_演習_レジの待ち行列（問題）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1Q1Ry-aDhMIlzxVeetUdEF_LGlXQuUpQVpEch8RTPIRk/edit?usp=drivesdk"
  },
  "ss41w": {
    "title": "SS4-1_演習1_レジの待ち行列",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/14Fs54Q1FPob67A7Q0TxvLPkM3lpUKT0iGKoLPvg1dlU/edit?usp=drivesdk"
  },
  "ss41wa": {
    "title": "SS4-1_演習1_レジの待ち行列（解答）",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1d2bXblo1vVOrhwFoqOI8SZDXthoSnNIxvvdJ7MAsXNE/edit?usp=drivesdk"
  },
  "ss41ws": {
    "title": "SS4-1_演習1_レジの待ち行列（ワークシート）",
    "description": "",
    "url": "https://docs.google.com/document/d/1QCULywd_CLseWqAVMg26gBYHeCHCiizCQ_a6PWlwSeQ/edit?usp=drivesdk"
  },
  "test": {
    "title": "提出スクリプトのテスト用",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1syghvakxrn-90oH9fz4YQrOIsWfHiHxsbqxV3uHkRb8/edit?usp=drivesdk"
  },
  "test1": {
    "title": "テンプレテスト1xxx",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1lK7EoSqBOjKujtjnajC9KqD9elVCHvpaPQINzrAoC_s/edit?usp=drivesdk"
  },
  "test2": {
    "title": "テンプレテスト2",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1CHmI6f8heZT7HqwB1YvVXaAupSVp2pk_vhWvm3iRvnA/edit?usp=drivesdk"
  },
  "test3": {
    "title": "テンプレテスト3",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1kX9JGkx_6kylZFI0zoh29l2VEccpgQ6zdLyojiTOe9c/edit?usp=drivesdk"
  },
  "test4": {
    "title": "テンプレテスト4",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1FE6B89QqMb5fjHfTHhEAz4ubx5eYMBWZ40wfWCt7C3I/edit?usp=drivesdk"
  },
  "test5": {
    "title": "テンプレテスト5",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1ooOcPA-VlCpptG0aAzrBSSa7860RA6e_XQsc_hrwK7s/edit?usp=drivesdk"
  },
  "test6": {
    "title": "テンプレテスト6",
    "description": "",
    "url": "https://docs.google.com/spreadsheets/d/1uYnXA1iSexawYlsgjRMdG0ipHeMvLlHl-3O8QOqVKZg/edit?usp=drivesdk"
  }
};
window.files = files;

const urls = {
  "attendance": {
    "title": "出欠状況確認",
    "description": "出欠状況確認",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbyLdvmDDW8wHjQA_JLe4eE_lvnLQmTSQ1skWxjRGJ1WjlUyIJ7_dFk8KmtZDU-bwQ/exec"
  },
  "htmlfinsubm": {
    "title": "HTML最終課題 提出方法",
    "description": "HTML最終課題 提出方法",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbzMZ_7lqx9A4eyMNJUBjG68Xbbo96H2fCpQKSYbu3VfNpKTHKQf74WFAZVjd25k100_/exec"
  }
};
window.urls = urls;
