// FAQ Data - Hardcoded for offline access and faster loading
// Last updated: 2025-12-23

export type FAQItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
};

export const FAQ_DATA: Record<'ko' | 'en' | 'es' | 'zh-TW', FAQItem[]> = {
  ko: [
    {
      id: 'ko-1',
      question: '데이데이트는 어떤 앱인가요?',
      answer: '데이데이트는 매일 새로운 데이트 미션을 제공하는 커플 전용 앱입니다. AI가 두 분의 취향, 상황, 날씨를 분석하여 맞춤형 데이트 미션을 추천해 드립니다. 완료한 미션들은 둘만의 소중한 추억으로 남게 되며, 데이데이트와 함께 특별한 순간들을 차곡차곡 쌓아가실 수 있습니다.',
      category: 'general',
    },
    {
      id: 'ko-2',
      question: '미션은 하루에 몇 개 받을 수 있나요?',
      answer: 'Free 플랜은 하루 1회(3개), Premium 플랜은 하루 2회(6개)까지 미션 카드를 받아보실 수 있습니다. 모든 미션은 자정에 초기화됩니다. 또한 데이데이트에서 직접 제공하는 특별 미션도 수시로 만나보실 수 있습니다.',
      category: 'mission',
    },
    {
      id: 'ko-3',
      question: '미션은 어떻게 완료하나요?',
      answer: "미션 카드에서 '시작하기' 버튼을 누른 후, 인증 사진을 촬영하고 서로에게 한마디를 작성하면 미션이 완료됩니다. 인증 사진은 둘만의 추억으로 저장되니, 기억에 남는 순간을 담아주세요. Free 플랜은 하루 1개, Premium 플랜은 무제한으로 미션을 완료하실 수 있습니다.",
      category: 'mission',
    },
    {
      id: 'ko-4',
      question: '미션 사진을 찍은 후 다른 미션을 진행해도 되나요?',
      answer: "네, 가능합니다. 단, '서로에게 한마디'를 먼저 작성한 미션이 해당 날짜에 완료할 수 있는 미션으로 지정됩니다.",
      category: 'mission',
    },
    {
      id: 'ko-5',
      question: '미션 완료 후 사진을 삭제하면 미션을 다시 시작할 수 있나요?',
      answer: '아니요, 한 번 완료된 미션은 사진 삭제 여부와 관계없이 다시 시작할 수 없습니다.',
      category: 'mission',
    },
    {
      id: 'ko-6',
      question: '미션 보관(Keep) 개수가 제한되어 있나요?',
      answer: 'Free 플랜은 최대 5개까지 미션을 보관할 수 있습니다. Premium 플랜은 개수 제한 없이 미션을 보관하실 수 있습니다.',
      category: 'mission',
    },
    {
      id: 'ko-7',
      question: '기념일은 어디서 확인할 수 있나요?',
      answer: '홈 화면 상단의 날짜 문구를 탭하시면 기념일 목록을 확인하실 수 있습니다.',
      category: 'anniversary',
    },
    {
      id: 'ko-8',
      question: '기념일 수정 및 삭제는 어떻게 하나요?',
      answer: '자동으로 생성되는 기본 기념일(100일, 1주년 등)은 수정 및 삭제가 불가능합니다. 직접 추가하신 기념일만 수정 및 삭제가 가능합니다.',
      category: 'anniversary',
    },
    {
      id: 'ko-9',
      question: '앨범은 몇 개까지 만들 수 있나요?',
      answer: 'Free 플랜은 최대 2개까지 앨범을 생성할 수 있습니다. Premium 플랜은 개수 제한 없이 앨범을 생성하실 수 있습니다.',
      category: 'album',
    },
    {
      id: 'ko-10',
      question: '페어링을 해제하면 어떻게 되나요?',
      answer: '페어링이 해제되면 두 분 모두 페어링 화면으로 이동하게 됩니다. 기존 파트너와 30일 이내에 다시 페어링하시면 모든 데이터가 복구됩니다. 새로운 파트너와 페어링하시면 처음부터 다시 시작됩니다. 단, 두 분 중 한 분이라도 계정을 탈퇴하시면 데이터 복구가 불가능합니다.',
      category: 'account',
    },
    {
      id: 'ko-11',
      question: '계정을 탈퇴하면 어떻게 되나요?',
      answer: '계정 탈퇴 시 파트너와의 페어링이 즉시 해제되며, 모든 데이터가 영구 삭제되어 복구가 불가능합니다.',
      category: 'account',
    },
  ],
  en: [
    {
      id: 'en-1',
      question: 'What is Daydate?',
      answer: 'Daydate is a couple-exclusive app that provides new date missions every day. Our AI analyzes both of your preferences, situations, and weather to recommend personalized date missions. Completed missions become precious memories for just the two of you, allowing you to build up special moments together with Daydate.',
      category: 'general',
    },
    {
      id: 'en-2',
      question: 'How many missions can I receive per day?',
      answer: 'Free plan allows 1 generation per day (3 missions), while Premium plan allows up to 2 generations per day (6 missions). All missions reset at midnight. You can also discover special missions directly provided by Daydate from time to time.',
      category: 'mission',
    },
    {
      id: 'en-3',
      question: 'How do I complete a mission?',
      answer: "Tap the 'Start' button on a mission card, take a verification photo, and write a message to each other to complete the mission. The verification photo is saved as a memory for just the two of you, so capture a memorable moment. Free plan allows 1 mission completion per day, while Premium plan offers unlimited completions.",
      category: 'mission',
    },
    {
      id: 'en-4',
      question: 'Can I start another mission after taking a photo for one?',
      answer: "Yes, you can. However, the mission for which you first write the 'message to each other' will be designated as the mission that can be completed for that day.",
      category: 'mission',
    },
    {
      id: 'en-5',
      question: 'If I delete the photo after completing a mission, can I restart it?',
      answer: 'No, once a mission is completed, it cannot be restarted regardless of whether the photo is deleted.',
      category: 'mission',
    },
    {
      id: 'en-6',
      question: 'Is there a limit to how many missions I can keep?',
      answer: 'Free plan allows you to keep up to 5 missions. Premium plan has no limit on the number of missions you can keep.',
      category: 'mission',
    },
    {
      id: 'en-7',
      question: 'Where can I check anniversaries?',
      answer: 'You can view the anniversary list by tapping the date text at the top of the home screen.',
      category: 'anniversary',
    },
    {
      id: 'en-8',
      question: 'How do I edit or delete anniversaries?',
      answer: 'Automatically generated default anniversaries (100 days, 1st anniversary, etc.) cannot be edited or deleted. Only anniversaries you have manually added can be edited or deleted.',
      category: 'anniversary',
    },
    {
      id: 'en-9',
      question: 'How many albums can I create?',
      answer: 'Free plan allows you to create up to 2 albums. Premium plan has no limit on the number of albums you can create.',
      category: 'album',
    },
    {
      id: 'en-10',
      question: 'What happens if I unpair?',
      answer: 'When unpairing occurs, both of you will be redirected to the pairing screen. If you re-pair with your previous partner within 30 days, all data will be restored. If you pair with a new partner, you will start fresh. However, if either of you deletes your account, data recovery will not be possible.',
      category: 'account',
    },
    {
      id: 'en-11',
      question: 'What happens if I delete my account?',
      answer: 'When you delete your account, the pairing with your partner is immediately terminated, and all data is permanently deleted and cannot be recovered.',
      category: 'account',
    },
  ],
  es: [
    {
      id: 'es-1',
      question: '¿Qué es Daydate?',
      answer: 'Daydate es una app exclusiva para parejas que ofrece nuevas misiones de cita cada día. Nuestra IA analiza las preferencias, situación y clima de ambos para recomendar misiones personalizadas. Las misiones completadas se convierten en recuerdos especiales de los dos, permitiéndoles construir momentos especiales juntos con Daydate.',
      category: 'general',
    },
    {
      id: 'es-2',
      question: '¿Cuántas misiones puedo recibir por día?',
      answer: 'El plan Gratis permite 1 generación por día (3 misiones), mientras que el plan Premium permite hasta 2 generaciones por día (6 misiones). Todas las misiones se reinician a medianoche. También puedes descubrir misiones especiales proporcionadas directamente por Daydate de vez en cuando.',
      category: 'mission',
    },
    {
      id: 'es-3',
      question: '¿Cómo completo una misión?',
      answer: "Toca el botón 'Comenzar' en una tarjeta de misión, toma una foto de verificación y escríbanse un mensaje mutuamente para completar la misión. La foto se guarda como un recuerdo solo para ustedes dos, así que capturen un momento memorable. El plan Gratis permite 1 misión completada por día, mientras que Premium ofrece completaciones ilimitadas.",
      category: 'mission',
    },
    {
      id: 'es-4',
      question: '¿Puedo iniciar otra misión después de tomar una foto?',
      answer: "Sí, puedes. Sin embargo, la misión para la cual escribas primero el 'mensaje mutuo' será designada como la misión que puede completarse ese día.",
      category: 'mission',
    },
    {
      id: 'es-5',
      question: 'Si borro la foto después de completar una misión, ¿puedo reiniciarla?',
      answer: 'No, una vez que una misión está completada, no puede reiniciarse sin importar si la foto se borra.',
      category: 'mission',
    },
    {
      id: 'es-6',
      question: '¿Hay un límite de misiones que puedo guardar?',
      answer: 'El plan Gratis permite guardar hasta 5 misiones. El plan Premium no tiene límite en el número de misiones que puedes guardar.',
      category: 'mission',
    },
    {
      id: 'es-7',
      question: '¿Dónde puedo ver los aniversarios?',
      answer: 'Puedes ver la lista de aniversarios tocando el texto de fecha en la parte superior de la pantalla de inicio.',
      category: 'anniversary',
    },
    {
      id: 'es-8',
      question: '¿Cómo edito o elimino aniversarios?',
      answer: 'Los aniversarios generados automáticamente (100 días, 1er aniversario, etc.) no pueden editarse ni eliminarse. Solo los aniversarios que hayas añadido manualmente pueden editarse o eliminarse.',
      category: 'anniversary',
    },
    {
      id: 'es-9',
      question: '¿Cuántos álbumes puedo crear?',
      answer: 'El plan Gratis permite crear hasta 2 álbumes. El plan Premium no tiene límite en el número de álbumes que puedes crear.',
      category: 'album',
    },
    {
      id: 'es-10',
      question: '¿Qué pasa si desemparejo?',
      answer: 'Cuando se desempareja, ambos serán redirigidos a la pantalla de emparejamiento. Si vuelven a emparejarse con su pareja anterior en 30 días, todos los datos serán restaurados. Si se emparejan con una nueva pareja, comenzarán desde cero. Sin embargo, si alguno de los dos elimina su cuenta, la recuperación de datos no será posible.',
      category: 'account',
    },
    {
      id: 'es-11',
      question: '¿Qué pasa si elimino mi cuenta?',
      answer: 'Cuando eliminas tu cuenta, el emparejamiento con tu pareja termina inmediatamente y todos los datos se eliminan permanentemente sin posibilidad de recuperación.',
      category: 'account',
    },
  ],
  'zh-TW': [
    {
      id: 'zh-TW-1',
      question: 'Daydate是什麼樣的App？',
      answer: 'Daydate是一款專為情侶設計的App，每天提供新的約會任務。AI會分析你們的喜好、情況和天氣，推薦客製化的約會任務。完成的任務會成為兩人專屬的珍貴回憶，讓你們一起累積特別的時刻。',
      category: 'general',
    },
    {
      id: 'zh-TW-2',
      question: '每天可以獲得幾個任務？',
      answer: '免費方案每天可獲得1次（3個任務），Premium方案每天可獲得2次（6個任務）。所有任務在午夜重置。你也可以不定期發現Daydate提供的特別任務。',
      category: 'mission',
    },
    {
      id: 'zh-TW-3',
      question: '如何完成任務？',
      answer: '點擊任務卡片上的「開始」按鈕，拍攝認證照片，然後互相寫下給對方的話就能完成任務。認證照片會保存為兩人專屬的回憶，記得捕捉難忘的瞬間。免費方案每天可完成1個任務，Premium方案則不限次數。',
      category: 'mission',
    },
    {
      id: 'zh-TW-4',
      question: '拍完一個任務的照片後，可以進行其他任務嗎？',
      answer: '可以的。不過，先寫下「給對方的話」的任務會被指定為當天可完成的任務。',
      category: 'mission',
    },
    {
      id: 'zh-TW-5',
      question: '完成任務後刪除照片，可以重新開始嗎？',
      answer: '不行，任務一旦完成，無論是否刪除照片都無法重新開始。',
      category: 'mission',
    },
    {
      id: 'zh-TW-6',
      question: '可以收藏的任務數量有限制嗎？',
      answer: '免費方案最多可收藏5個任務。Premium方案則沒有收藏數量限制。',
      category: 'mission',
    },
    {
      id: 'zh-TW-7',
      question: '在哪裡可以查看紀念日？',
      answer: '點擊首頁上方的日期文字即可查看紀念日列表。',
      category: 'anniversary',
    },
    {
      id: 'zh-TW-8',
      question: '如何編輯或刪除紀念日？',
      answer: '系統自動生成的預設紀念日（100天、週年等）無法編輯或刪除。只有你手動新增的紀念日才能編輯或刪除。',
      category: 'anniversary',
    },
    {
      id: 'zh-TW-9',
      question: '可以建立幾個相簿？',
      answer: '免費方案最多可建立2個相簿。Premium方案則沒有相簿數量限制。',
      category: 'album',
    },
    {
      id: 'zh-TW-10',
      question: '解除配對會怎樣？',
      answer: '解除配對後，兩人都會被導向配對畫面。如果在30天內與原來的伴侶重新配對，所有資料都會恢復。如果與新伴侶配對，則會重新開始。但是，如果任何一方刪除帳戶，資料將無法恢復。',
      category: 'account',
    },
    {
      id: 'zh-TW-11',
      question: '刪除帳戶會怎樣？',
      answer: '刪除帳戶後，與伴侶的配對會立即解除，所有資料將永久刪除且無法恢復。',
      category: 'account',
    },
  ],
};
