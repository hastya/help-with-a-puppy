// Breed catalogue (browser build). Exposed as window.BREEDS + window.getBreed.
// Mirror of server/data/breeds.js. Weights in kg.
(function () {
  const BREEDS = [
    { code: 'labrador', name: 'Лабрадор-ретривер', group: 'Ретриверы', adultWeightMin: 25, adultWeightMax: 36, activityFactor: 1.6,
      diseases: ['Дисплазия тазобедренного сустава', 'Ожирение', 'Заболевания глаз (PRA)'],
      dangerousFoods: ['Виноград и изюм', 'Шоколад', 'Ксилит', 'Лук и чеснок'],
      trainingTips: 'Лабрадоры пищевые мотивированные — легко обучаются на лакомствах, но склонны к перееданию. Уделите внимание команде «Фу».' },
    { code: 'corgi', name: 'Вельш-корги пемброк', group: 'Пастушьи', adultWeightMin: 10, adultWeightMax: 14, activityFactor: 1.5,
      diseases: ['Проблемы со спиной (IVDD)', 'Ожирение', 'Дегенеративная миелопатия'],
      dangerousFoods: ['Виноград и изюм', 'Шоколад', 'Авокадо', 'Жирная пища'],
      trainingTips: 'Корги — умные пастухи, склонны «покусывать» за ноги. Направляйте инстинкт в игры с игрушками.' },
    { code: 'husky', name: 'Сибирский хаски', group: 'Ездовые', adultWeightMin: 16, adultWeightMax: 27, activityFactor: 1.8,
      diseases: ['Катаракта', 'Дисплазия', 'Проблемы с ЖКТ'],
      dangerousFoods: ['Шоколад', 'Виноград и изюм', 'Кофеин', 'Алкоголь'],
      trainingTips: 'Хаски склонны к побегам — уделите внимание команде «Стоять» и надёжному вольеру. Нужна высокая физическая нагрузка.' },
    { code: 'gsd', name: 'Немецкая овчарка', group: 'Служебные', adultWeightMin: 22, adultWeightMax: 40, activityFactor: 1.7,
      diseases: ['Дисплазия тазобедренного сустава', 'Дегенеративная миелопатия', 'Вздутие живота (заворот)'],
      dangerousFoods: ['Шоколад', 'Лук и чеснок', 'Виноград и изюм', 'Кости трубчатые'],
      trainingTips: 'Овчарки нуждаются в работе для ума. Отрабатывайте выдержку и сложные команды, иначе разовьётся тревожность.' },
    { code: 'chihuahua', name: 'Чихуахуа', group: 'Той', adultWeightMin: 1.5, adultWeightMax: 3, activityFactor: 1.4,
      diseases: ['Вывих коленной чашечки', 'Проблемы с зубами', 'Гидроцефалия', 'Гипогликемия'],
      dangerousFoods: ['Крупные кости', 'Шоколад', 'Ксилит', 'Твёрдые лакомства'],
      trainingTips: 'Мелкие породы нуждаются в ранней социализации, чтобы не развить «синдром маленькой собаки». Кости противопоказаны.' },
    { code: 'greatdane', name: 'Немецкий дог', group: 'Молоссы', adultWeightMin: 45, adultWeightMax: 90, activityFactor: 1.5,
      diseases: ['Вздутие живота (заворот)', 'Дилатационная кардиомиопатия', 'Дисплазия', 'Остеосаркома'],
      dangerousFoods: ['Шоколад', 'Виноград и изюм', 'Лук и чеснок', 'Жирная пища'],
      trainingTips: 'Гиганты растут медленно — избегайте перегрузок суставов у щенка. Кормите дробно для профилактики заворота.' },
    { code: 'poodle', name: 'Пудель (стандартный)', group: 'Декоративные', adultWeightMin: 20, adultWeightMax: 32, activityFactor: 1.6,
      diseases: ['Болезнь Аддисона', 'Эпилепсия', 'Проблемы с глазами', 'Вздутие живота'],
      dangerousFoods: ['Шоколад', 'Ксилит', 'Виноград и изюм', 'Кофеин'],
      trainingTips: 'Пудели очень умны и быстро скучают. Разнообразьте тренировки трюками и апортировкой.' },
    { code: 'jack_russell', name: 'Джек-рассел-терьер', group: 'Терьеры', adultWeightMin: 5, adultWeightMax: 8, activityFactor: 1.7,
      diseases: ['Вывих коленной чашечки', 'Глухота', 'Болезнь Легга-Пертеса', 'Атаксия'],
      dangerousFoods: ['Шоколад', 'Ксилит', 'Виноград и изюм', 'Лук'],
      trainingTips: 'Охотничий инстинкт очень силён. Много копают и лают — направьте энергию в норные игры и аджилити.' },
    { code: 'mixed', name: 'Метис / Дворняжка', group: 'Метисы', adultWeightMin: 5, adultWeightMax: 35, activityFactor: 1.6,
      diseases: ['Зависят от предполагаемых пород — наблюдайте у ветеринара'],
      dangerousFoods: ['Виноград и изюм', 'Шоколад', 'Ксилит', 'Лук и чеснок'],
      trainingTips: 'Метисы часто крепче здоровьем. Ориентируйтесь на реальный вес и темперамент конкретной собаки.' },
  ];

  window.BREEDS = BREEDS;
  window.getBreed = function (code) { return BREEDS.find((b) => b.code === code) || null; };
})();
