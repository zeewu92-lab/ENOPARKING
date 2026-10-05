export const ACHIEVEMENT_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'milestone', name: '里程碑' },
  { id: 'collection', name: '收藏' },
  { id: 'secret', name: '彩蛋' },
  { id: 'senior3', name: '高三' }
];

export const ACHIEVEMENTS = [
  { id: 'first-word', category: 'milestone', icon: '🌱', name: '第一顆', description: '完成第一個單詞', target: 1, stat: 'totalWords', message: '開始了。' },
  { id: 'words-10', category: 'milestone', icon: '🌿', name: '種下十顆', description: '累計學習 10 個單詞', target: 10, stat: 'totalWords', message: '十顆種子，剛剛好。' },
  { id: 'words-30', category: 'milestone', icon: '🌳', name: '小小花園', description: '累計學習 30 個單詞', target: 30, stat: 'totalWords', message: '花園有了雛形。' },
  { id: 'words-100', category: 'milestone', icon: '🏡', name: '花園初成', description: '累計學習 100 個單詞', target: 100, stat: 'totalWords', message: '已經是一片小花園了。' },
  { id: 'words-300', category: 'milestone', icon: '🌸', name: '花開滿園', description: '累計學習 300 個單詞', target: 300, stat: 'totalWords', message: '這裡曾經是一片荒地。' },
  { id: 'streak-7', category: 'milestone', icon: '🔥', name: '連續 7 天', description: '連續 7 天完成每日學習', target: 7, stat: 'streak', message: '一週，剛剛好。' },
  { id: 'streak-30', category: 'milestone', icon: '🔥', name: '連續 30 天', description: '連續 30 天完成每日學習', target: 30, stat: 'streak', message: '一個月。習慣已經長出來了。' },
  { id: 'study-days-365', category: 'milestone', icon: '🗓️', name: '四季同行', description: '累計學習 365 天', target: 365, stat: 'studyDays', message: '一整年。' },

  { id: 'flowers-5', category: 'collection', icon: '🌸', name: '集花者', description: '解鎖 5 種不同花型', target: 5, stat: 'flowerCount', message: '每種花都有自己的故事。' },
  { id: 'goal-7', category: 'collection', icon: '🎯', name: '目標完成者', description: '連續 7 天完成每日目標', target: 7, stat: 'goalStreak', message: '說到，就做到。' },
  { id: 'early-bird', category: 'secret', icon: '🌅', name: '早起的種花人', description: '在早上 6:00 至 7:00 完成學習', target: 1, stat: 'earlyBird', hidden: true, message: '有些光，只在清晨出現。' },
  { id: 'night-gardener', category: 'secret', icon: '🌙', name: '深夜種花人', description: '在 23:00 後完成學習', target: 1, stat: 'nightStudy', hidden: true, message: '夜裡的花，也很安靜。' },
  { id: 'bonus-first', category: 'secret', icon: '✨', name: '破戒者', description: '第一次使用加餐', target: 1, stat: 'bonusUses', hidden: true, message: '想多學一點，也是可以的。' },

  { id: 's3-osmanthus', category: 'senior3', icon: '🏅', name: '金桂', description: '高三第 1 天', target: 1, stat: 'senior3Days', senior3At: 1, message: '第一天。' },
  { id: 's3-lycoris', category: 'senior3', icon: '🏅', name: '彼岸花', description: '高三第 7 天', target: 7, stat: 'senior3Days', senior3At: 7, message: '走過第一段路。' },
  { id: 's3-plum', category: 'senior3', icon: '🏅', name: '寒梅', description: '高三第 30 天', target: 30, stat: 'senior3Days', senior3At: 30, message: '冬天越冷，花越香。' },
  { id: 's3-sunflower', category: 'senior3', icon: '🏅', name: '向日葵', description: '高三第 60 天', target: 60, stat: 'senior3Days', senior3At: 60, message: '朝著光走。' },
  { id: 's3-champion', category: 'senior3', icon: '🏅', name: '狀元紅', description: '高三第 100 天', target: 100, stat: 'senior3Days', senior3At: 100, message: '這一朵，留給考場。' }
];
