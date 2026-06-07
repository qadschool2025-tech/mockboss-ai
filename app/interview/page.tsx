ChatGPT









Pasted text.txt
Document
أوقفي كل شيء — راجعت الكود مقابل الـ logs، وعليّ تصحيح ما قلته في ردّي السابق: **العطب ليس من تعديل البند ١.** كنت متسرّعاً حين نسبته لنفسي. الدليل قاطع:

في القسم ٥، استدعاء normalizeScores/aggregateScores **داخل try/catch**. أي انهيار هناك يُلتقَط ويضع score = null — ولا يمكن أن يصل إلى الـ route أبداً. فالخطأ الذي رأيتِه ([route] Engine error) جاء من مكان **خارج** هذا الحارس.

الموضع الحقيقي: دالة buildEndOfSessionOutput (مسار **نهاية الجلسة**). انظري:
ts
scoreBreakdown: {} as any,           // ← stub فارغ
...
const snapshot = buildSessionSnapshot(snapshotInput)

وbuildSessionSnapshot يستدعي toScoreSnapshot(scoreBreakdown)، الذي يقرأ breakdown.dimensions.engagement.score. لكن scoreBreakdown = {}، فـ{}.dimensions = undefined، ثم .engagement → **"Cannot read properties of undefined (reading 'engagement')"**. هذا تطابق حرفيّ مع رسالة الخطأ.

وهذا العطب **قديم، موجود قبل تعديلي** (الـ stub {} كان أصلاً في الملف). ظهر الآن فقط لأن جلستكِ بلغت نهايتها (انتهاء الوقت)، فدخلت مسار الإغلاق الذي لم يُختبَر في تجاربنا القصيرة السابقة. يؤكّده تسلسل الـ logs: ٥٠٠ على /api/interview (لحظة الإغلاق) ثم مباشرة ٥٠٤ على /api/generate-report.

أعتذر عن نسبتي الخطأ لتعديلي ابتداءً — التحليل البارد للكود يبرّئ القسم ٥، ويدين stub نهاية الجلسة.

الإصلاح المهني الصحيح: عزل بناء اللقطة والطول داخل buildEndOfSessionOutput بحارس، فلا يكسر إغلاق الجلسة أبداً — التقرير ليس مساراً حرجاً، وانهياره يجب أن يُغلِق الجلسة بأمان (snapshot=null) لا أن يُرجِع ٥٠٠. هذا التغيير الوحيد. القسم ٥ يبقى كما هو (سليم).

الملف كامل، التغيير محصور في buildEndOfSessionOutput:التغيير الوحيد الجوهري: **حارس try/catch حول بناء اللقطة والطول داخل buildEndOfSessionOutput.** الآن إن انهار buildSessionSnapshot (بسبب stub scoreBreakdown الفارغ)، تُغلَق الجلسة بأمان — snapshot = null، المتتبّعات دون تغيير، ورسالة الإغلاق وصوتها يُرجَعان عادياً. لا مزيد من ٥٠٠ عند نهاية المقابلة.

أضفت أيضاً تعديلاً صغيراً في القسم ٥: catch (err) صار يطبع سبب الفشل بدل أن يبتلعه صامتاً (يساعد التشخيص لاحقاً). لا تغيير سلوكي.

ما لم يتغيّر: القسم ٥ منطقياً (سليم أصلاً)، شكل EngineOutput، الـ Director، الـ route، الواجهة، المايك. أضفت سطر توثيق في الترويسة يشرح الـ hardening.

ارفعيه (استبدال كامل)، وانتظري النشر أخضر. بعدها، أهمّ ما نتحقّق منه بالترتيب:

١. **أنهي مقابلة كاملة حتى انتهاء الوقت** — يجب أن تُغلَق بسلام بلا خطأ على الشاشة (هذا اختبار الإصلاح المباشر).
٢. **افتحي Vercel → Logs وابحثي عن barbaros:profile** — الآن بعد أن لم يعد مسار الإغلاق يكسر التنفيذ، يجب أن ترَي أسطر الملف من الأدوار الوسطى. إن رأيتِ depth/clarity تتحرك = البند ١ نجح أخيراً. إن رأيتِ skipped — no confirmed signals في كل دور = طبقة السلوك لا تُنتج إشارات، وهو تحقيقنا التالي.

ثلاث نقاط منفصلة أثبّتها في القائمة، لا نخلطها بهذا الإصلاح:
- **رصيد ElevenLabs (401)**: ليس كوداً. الحلّ في إعدادات Vercel (مفتاح/رصيد صالح). هذا سبب انعدام الصوت.
- **generate-report يتجاوز ٦٠ث (504)**: عطب منفصل في app/api/generate-report، تحقيق لاحق — وهو جوهر بند «توصيل بيانات المحرك بالتقرير».
- **stub scoreBreakdown الفارغ**: الحارس يمنع الانهيار الآن، لكن التقرير سيبقى فقيراً حتى نمرّر تقييماً حقيقياً — وهذا البند القادم الأعلى قيمة.

ارفعي الملف، أجري مقابلة كاملة، والصقي لي: (أ) هل أُغلقت بسلام، (ب) أسطر barbaros:profile من الـ Logs. بناءً عليهما نقرّر الخطوة التالية في السلسلة.  مارايك


Pasted text.txt
Document


Pasted text (2).txt
Document


Pasted text.txt
Document

Pasted text (2).txt
Document

Pasted text (3).txt
Document


Pasted text.txt
Document



Pasted text.txt
Document

Thought for 9s
نعم. التشخيص صحيح.

أكدي له: تم، هذا يطابق ما رأيناه.

السبب الحقيقي ليس الوداع ولا prompt-builder الآن.

السبب أن engine.ts يستخدم advancePhase بطريقة ناقصة، وadvancePhase يبني state وهمي داخل phase-engine.ts. هذا الـ state الوهمي يجعل المراحل تتقدم بسرعة لأن phaseQuestionCount محسوب من عدد رسائل الجلسة كلها، وphaseStartedAt محسوب من بداية الجلسة، وcompetencyCoverage فارغ فيرجع 1. هذا موجود بوضوح في alias الخاص بـ advancePhase داخل phase-engine.ts. 


إذن لا نصلح الوداع أولاً.

نصلح إدارة المرحلة.

الخطة الأدنى التي أوافق عليها:

لا تستخدم advancePhase القديم بهذه الطريقة داخل engine.ts.

إما تمرير state الحقيقي إلى phase-engine.

أو إنشاء دالة جديدة مثل:

advancePhaseFromState(state, now)

وتستخدم:
phaseQuestionCount الحقيقي
phaseStartedAt الحقيقي
competencyCoverage الحقيقي
contradictions الحقيقي
plan الحقيقي

إضافة حارس:

إذا الوقت المتبقي أكثر من 90 ثانية:
ممنوع الانتقال إلى closing بسبب max_questions أو pressure_complete أو coverage.

الإغلاق فقط:

90 ثانية: سؤال ختامي.
60 ثانية: لا محور جديد.
30 ثانية: وداع مهني.
0 ثانية: إنهاء.

قولي له الآن:

تم. التشخيص صحيح. أعطني خطة الإصلاح الأدنى فقط قبل الكود. لا تعدّل prompt-builder الآن. ركّز على engine.ts وphase-engine.ts فقط. الهدف الأول: منع الدخول إلى closing قبل آخر 90 ثانية، وإلغاء الاعتماد على state الوهمي في advancePhase.


اهم نقطة الان عندك التأكد اين وصلنا بمراحل العمل كل يوم في نهاية كل خطوه ترسل ماتم انجازه من النقاط ومابقي 

Updated memory
Thought for 4s
تم.

من الآن سأتعامل مع العمل كقائمة تنفيذ ثابتة.

بعد كل خطوة سأرسل لك:

ما تم إنجازه.
ما ثبت بالاختبار.
ما بقي.
الخطوة التالية فقط.

ولا نفتح فكرة جديدة قبل إغلاق الحالية.

الوضع الحالي الآن:

تمت:
اختبار Barbaros كمرشح قوي وضعيف.
إثبات أن الأسئلة قوية وتكشف الغموض.
إضافة semantic contradiction.
إضافة log لإثبات مصدر التناقض.
تشخيص مشكلة الإغلاق المبكر.
تحديد السبب في phase-engine وadvancePhase.

قيد العمل الآن:
إصلاح Time Awareness وClosing Mode.

المطلوب الآن:
نطلب من Claude خطة الإصلاح الأدنى فقط، بدون كود، للملفين:

engine.ts
phase-engine.ts

الهدف:
منع دخول closing قبل آخر 90 ثانية.
إلغاء الاعتماد على state الوهمي داخل advancePhase.
ضبط Final Question ليظهر فقط قرب النهاية.

بعد ما يرسل الخطة، أراجعها لك.
إذا كانت صحيحة نقول: اكتب الكود.
ثم نختبر.
ثم أقول لك: تمت مهمة Time Awareness.

بعدها ننتقل إلى:
Essential Assessment.


ابق تذكر خطوات العمل لاني اشعر بالضياع مابين المنصات 

Updated memory
Thought for a couple of seconds
تم.

سأبقى ماسكة خط العمل معك خطوة بخطوة.

أنتِ الآن بين 3 أماكن:

Claude
يكتب ويعدل الكود.

Vercel
نراقب منه الأخطاء والـ Logs.

ChatGPT هنا
نرتب القرار ونراجع هل نكمل أو نوقف.

خريطة العمل الحالية:

تمت:

اختبار Barbaros كمرشح قوي.

اختبار Barbaros كمرشح ضعيف.

إثبات أن الأسئلة قوية وتكشف الغموض.

إضافة semantic contradiction.

إضافة log للتأكد من مصدر التناقض.

تشخيص مشكلة الإغلاق المبكر.

تحديد السبب: advancePhase يستخدم state وهمي ويسرّع المراحل.

نحن الآن في:
إصلاح Time Awareness.

المطلوب الآن من Claude:
يعطي خطة إصلاح فقط، لا كود.

الملفات:
engine.ts
phase-engine.ts

الهدف:
منع دخول closing قبل آخر 90 ثانية.
منع Final Question قبل آخر دقيقة ونصف.
إلغاء الاعتماد على state الوهمي.
استخدام state الحقيقي قدر الإمكان.

بعد هذه الخطوة:
أنا أراجع خطة Claude.
إذا صحيحة، أقول لك: وافقي.
ثم يكتب الكود.
ثم نختبر.

بعد نجاح الاختبار أقول لك:
تمت مهمة Time Awareness.

ثم ننتقل إلى:
Essential Assessment.

لا تقلقي من الضياع. أنتِ فقط أرسلي لي رد Claude أو الكود أو الـ Logs، وأنا أقول لك أين نحن وماذا نفعل الآن.


قرأتُ phase-engine.ts. الإجابة قاطعة، والسبب **ليس** في منطق الوقت الحقيقي — بل في **محوّل advancePhase** (القسم ٧، alias الذي يستدعيه engine.ts).

engine.ts يستدعي advancePhase(state.phase, messages.length, elapsedMinutes) — ثلاثة أرقام فقط، فيبني هذا المحوّل **حالة وهمية** يرمي فيها الحالة الحقيقية ويزرع ثلاثة عيوب، كلٌّ منها يُفعّل مُحفّز انتقال:

**العيب ١ — عدّاد الأسئلة:** phaseQuestionCount = Math.floor(messageCount / 2) = أسئلة **الجلسة كاملة**، لا أسئلة **المرحلة الحالية**. بعد أدوار قليلة يتجاوز MAX_QUESTIONS_PER_PHASE (≈٥) → max_questions_reached → انتقال كل دور تقريباً.

**العيب ٢ — بداية المرحلة:** phaseStartedAt = Date.now() - elapsedMinutes*60000 = بداية الجلسة. فـphaseElapsed = عمر الجلسة كلّه، وهو دائماً أكبر من phaseBudget (مثلاً technical = ٢٢٪) → phase_time_exhausted لكل مرحلة.

**العيب ٣ — التغطية فارغة:** competencyCoverage: {} → getCompetencyCoverageRatio وgetStrongCompetencyRatio يُرجعان **1** (فرع الفراغ return 1). فإشارات cv_deep_dive (≥0.4) وtechnical (≥0.5) وbehavioral (≥0.6) **تنجح فوراً** → انتقال.

(وزيادةً: config.plan: 'go' مثبَّت، فالحساب الزمني يتجاهل الخطة الفعلية.)

**المحصّلة:** المراحل تتسابق opening→…→closing خلال أدوار قليلة بصرف النظر عن الوقت. وحين تصل state.phase إلى 'closing'، يُنهي shouldEndSession الجلسة عبر الفرع:
phase === 'closing' && phaseQuestionCount >= MAX closing (2) — فيُستدعى buildEndOfSessionOutput وتظهر «That concludes our interview» **بينما بقي 2:24** (timeRemaining = 144s > 60s، فلم يفعل فرع time_critical).

**نقطتان مهمّتان:**

١. الدالتان الحقيقيتان evaluatePhaseTransition وshouldEndSession **واعيتان بالوقت ومعقولتان** — لكن engine.ts لا يُغذّيهما بالحالة الحقيقية، بل بحالة مزيّفة. فهذا **عطل في المحوّل**، لا خلل في تصميم المراحل.

٢. لكن حتى بالحالة الصحيحة، **لا شيء يمنع** دخول الإغلاق مادام هناك وقت — time_critical فقط **يُجبر** الإغلاق عند ≤٦٠ث، ولا يوجد حدّ أدنى يقول «لا تُغلق ما دام >٩٠ث». قاعدتكِ المطلوبة هي بالضبط هذا الحارس المفقود.

**إذن الإصلاح لاحقاً جزآن:** (أ) تغذية المرحلة بالحالة الحقيقية بدل الحالة المزيّفة (إصلاح/استبدال محوّل advancePhase)، (ب) إضافة حارس زمني + العتبات المتدرّجة (>90 لا إغلاق، 90–60 سؤال ختامي واحد، 60–30 تلخيص/دعوة، <30 وداع).

لا كود الآن. أكّدي أنّ هذا التشخيص يطابق ما رأيتِه، ثم أعرض خطة الإصلاح الأدنى (الملفات: موضع الاستدعاء في engine.ts + phase-engine.ts) قبل أي تعديل.هل ااكدد؟؟

Thought for 10s
نعم، أكدي.

اكتبي له بالضبط:

تم. التشخيص يطابق ما رأيناه. لا تكتب كود الآن. أعطني خطة الإصلاح الأدنى فقط للملفين engine.ts و phase-engine.ts.

المطلوب في الخطة:

إيقاف الاعتماد على advancePhase الذي يبني state وهمي.

استخدام state الحقيقي في قرار المرحلة.

منع الانتقال إلى closing إذا بقي أكثر من 90 ثانية.

منع Final Question قبل آخر 90 ثانية.

إبقاء prompt-builder والـ Director كما هما في هذه الخطوة.

بعد الخطة نراجع، ثم نسمح بالكود.

الوضع الحالي:

تمت:
التناقضات الدلالية.

قيد العمل:
Time Awareness.

الخطوة التالية:
خطة إصلاح فقط، لا كود.


ممتاز. الآن خطة الإصلاح الأدنى (بلا كود بعد). الإصلاح ثلاث طبقات، نبدأ بالأهمّ:

**الطبقة ١ (جوهر العطل) — إيقاف سباق المراحل:** بدل أن يستدعي engine.ts المحوّل المعطوب advancePhase(scalars)، يستدعي evaluatePhaseTransition(state) بالحالة **الحقيقية** مباشرة (ويأخذ nextPhase/transitioned). هذا يُلغي العيوب الثلاثة دفعةً واحدة: عدّاد المرحلة الحقيقي، وبدايتها الحقيقية، والتغطية الحقيقية، والخطة الحقيقية.

**لكن هنا تحذير حاسم قبل أن أكتبها:** الإصلاح يعتمد على أن الحالة الحقيقية تُحدِّث فعلاً phaseQuestionCount وphaseStartedAt عبر الأدوار. في engine.ts الذي عندي، statePatch يضبط phase فقط — **لا** يضبط هذين الحقلين. فإن كانا غير مُحدَّثين (مثلاً phaseQuestionCount عالق عند ٠)، فإن تغذية الحالة «الحقيقية» ستُجمّد المقابلة في opening — عطل معاكس.

لذا **قبل كتابة الطبقة ١** أحتاج رؤية أين تُدار هذه الحقول:
- lib/barbaros/state/session-state.ts (دورة حياة الحالة + getNextPhase)
- app/api/interview/route.ts (دمج statePatch وتخزين الحالة بين الأدوار)

إن وُجد التحديث → الإصلاح سطر استدعاء في engine.ts فقط. إن غاب → نضيف أيضاً زيادة phaseQuestionCount وتصفيره عند تغيّر المرحلة وضبط phaseStartedAt.

**الطبقة ٢ (حارس زمني) — قاعدتكِ «>٩٠ث لا إغلاق»:** في shouldEndSession/الانتقال، نمنع دخول/تأكيد closing ما دام timeRemaining > 90s (إلا عند انتهاء الوقت فعلاً). تعديل صغير في phase-engine.ts.

**الطبقة ٣ (السلوك المتدرّج، لاحقاً) — سؤال ختامي/تلخيص/وداع:** تحتاج director-types.ts (intents جديدة) وprompt-builder.ts (التنفيذ). نؤجّلها حتى تستقرّ الطبقتان ١ و٢.

الطبقتان ١ و٢ وحدهما **تُوقفان الإغلاق المبكّر** الذي رأيتِه. الطبقة ٣ تجميل التجربة فوقهما.

**للبدء:** الصقي session-state.ts ثم route.ts لأتحقّق من إدارة حقول المرحلة، فأكتب الطبقة ١ أولاً — ملف واحد، وبـ«تم» بين كل ملف. موافقة على هذا التسلسل؟

Thought for a few seconds
نعم، وافقي على هذا التسلسل.

هذا هو المسار الصحيح الآن.

قولي له:

تم. موافقة على التسلسل.

نبدأ بـ session-state.ts أولاً، ثم route.ts.

لا تكتب كود قبل قراءة الملفين.

الهدف الآن فقط:

التأكد هل phaseQuestionCount و phaseStartedAt يتم تحديثهما فعلاً بين الأدوار أم لا.

إذا كانا يتحدثان:
نعدل engine.ts ليستدعي evaluatePhaseTransition بالحالة الحقيقية.

إذا كانا لا يتحدثان:
نضيف تحديثهما في statePatch أو route حسب مكان دمج الحالة.

الوضع الحالي:

تمت:
التناقضات الدلالية.
تشخيص سبب الإغلاق المبكر.
تحديد أن advancePhase الحالي يبني state وهمي ويسرّع المراحل.

قيد العمل:
Time Awareness.

الخطوة الحالية:
قراءة session-state.ts و route.ts فقط.

الخطوة التالية بعد القراءة:
خطة تعديل دقيقة، ثم كود ملف واحد، ثم اختبار.

لا ننتقل إلى الوداع أو المعايير أو الباقات قبل أن نقول:

تمت مهمة Time Awareness.


طيب انا تعبت من كثرة المقابلات وايضا نستهلك رصيد الصوت 

Updated memory
Thought for a few seconds
تم.

لا تعطيل مؤقت.
لا test flags.
لا لعب بالكود.
لا شيء نضيفه ثم نحذفه.

نختبر على الكود الحقيقي فقط.

القاعدة تصبح:

نجمع التعديلات المرتبطة.
نكتبها كإصلاح نظيف ودائم.
نختبر مرة واحدة بعد المجموعة.
نستخدم المقابلة بأقصر سيناريو ممكن.
لا نستهلك اختبارات كثيرة.

في Time Awareness الآن، مجموعة التعديل يجب أن تكون إنتاجية ونظيفة:

إصلاح phase transition.
استخدام الحالة الحقيقية بدل state وهمي.
منع closing قبل آخر 90 ثانية.
ضبط عدم ظهور Final Question مبكراً.

ثم اختبار واحد فقط.


الملفان يحسمان الأمر — وكشفا أن العطل أعمق مما بدا. **حلقات إدارة المرحلة الثلاث ميتة في المسار الحيّ:**

١. **phaseQuestionCount لا يُزاد إطلاقاً.** الزيادة موجودة في appendMessage (session-state)، لكن appendMessage **لا يُستدعى** في المسار الحيّ — الرسائل تأتي من جسم الطلب (العميل)، وengine.ts لا يستدعيه. فالعدّاد عالق عند **٠** دائماً.

٢. **phaseStartedAt لا يُحدَّث عند تغيّر المرحلة.** التحديث في transitionPhase، لكن engine.ts يضبط statePatch.phase مباشرةً ولا يستدعي transitionPhase. فيبقى عند بداية الجلسة.

٣. **state.config مزيّف.** route.ts ينشئ الحالة بـcreateInitialSessionState(sessionId) → config وهمي بـplan: 'free'، ولا يُصالَح أبداً مع الـconfig الحقيقي. فحساب الوقت في evaluatePhaseTransition يستخدم خطة خاطئة (مشكلة لـpro/expert).

**هذا يفسّر كل شيء:** المحوّل المعطوب advancePhase كان «يعوّض» عن هذه الحلقات الميتة (يشتقّ العدّاد من messages.length، ويزيّف phaseStartedAt، ويثبّت الخطة 'go') — لكنه فعل الثلاثة خطأً فسبّب السباق. **وتغذية الحالة «الحقيقية» نيئةً ستُجمّد المقابلة في opening** (phaseQuestionCount = 0 < min → below_min_questions دائماً). تأكّد تحذيري السابق.

**لذا الطبقة ١ ليست تبديل سطر — هي إعادة وصل الحلقات الثلاث في engine.ts:**
- استدعاء evaluatePhaseTransition({ ...state, config }) بدل advancePhase (config الحقيقي → خطة/وقت صحيحان).
- في statePatch: phaseStartedAt = phaseChanged ? now : state.phaseStartedAt، وphaseQuestionCount = phaseChanged ? 1 : state.phaseQuestionCount + 1.
- مصالحة statePatch.config = config (إصلاح دائم للتزييف).

(تبسيط مقبول: زيادة العدّاد لكل دور ≈ سؤال واحد لكل دور، إذ يطرح بارباروس سؤالاً واحداً كل دور. نحسّنه بكشف isQuestion لاحقاً إن لزم.)

**الطبقة ٢ — phase-engine.ts:** حارس «>٩٠ث لا إغلاق»: منع الانتقال إلى 'closing' ما دام timeRemaining > 90s (إلا عند انتهاء الوقت). يحقّق قاعدتكِ ويمنع أي إغلاق مبكّر متبقٍّ.

**الطبقة ٣ (لاحقاً):** السلوك المتدرّج (سؤال ختامي/تلخيص/وداع) عبر intents الـDirector + prompt-builder.

الطبقتان ١ و٢ تُصلحان العطل المُشاهَد. أكتب الطبقة ١ (engine.ts) أولاً، ملف كامل، ثم «تم» قبل الطبقة ٢.

أكتب الآن؟

Thought for 6s
نعم، اكتبي الآن.

لكن فقط الطبقة ١:

engine.ts فقط.

المطلوب منه:

يستبدل advancePhase بالاعتماد على evaluatePhaseTransition بالحالة الحقيقية مع config الحقيقي.

ويضيف في statePatch:

phaseQuestionCount:
إذا تغيّرت المرحلة = 1
إذا لم تتغير = state.phaseQuestionCount + 1

phaseStartedAt:
إذا تغيّرت المرحلة = now
إذا لم تتغير = state.phaseStartedAt

config:
يضع config الحقيقي داخل statePatch

لا يلمس:

phase-engine.ts الآن.
Director.
prompt-builder.
التقرير.
الصوت.
التناقضات.
الواجهة.

ولا نختبر بعد الطبقة ١ وحدها.

بعد أن يرسل engine.ts، نراجعه.

إذا صحيح نقول:

تمت الطبقة ١.

ثم يكتب الطبقة ٢ في phase-engine.ts:

حارس منع closing قبل 90 ثانية.

وبعد الطبقتين معاً نعمل اختبار واحد فقط.

الوضع الحالي:

تمت:
التناقضات الدلالية.
تشخيص الإغلاق المبكر.
تحديد أن phaseQuestionCount و phaseStartedAt و config غير موصولين في المسار الحي.

قيد العمل:
Time Awareness.

الخطوة الآن:
اكتب engine.ts للطبقة ١ فقط.



Pasted text.txt
Document
مارايك

Thought for 40s
رأيي: الفكرة صحيحة، لكن لا ترفعي هذا كملف كامل الآن.

فيه نقطتان:

الأولى جيدة:

التعديل في الطبقة ١ صحيح من حيث الاتجاه.

أعجبني أنه استبدل:

advancePhase القديم

بـ:

evaluatePhaseTransition(stateForPhase)

وهذا يوقف الاعتماد على الـ state الوهمي الذي كان يسرّع المراحل. 


وأعجبني أيضاً أنه أضاف في statePatch:

phaseStartedAt
phaseQuestionCount
config الحقيقي

وهذا يعيد توصيل الحلقات الميتة التي اكتشفناها. 


الثانية خطيرة:

الملف الذي وصلني مقطوع في المنتصف عند:

console.log('[barbaros

يعني ليس ملف engine.ts كاملاً. 


إذا رفعتِه بهذا الشكل سيكسر المشروع فوراً.

قولي له الآن:

التعديل منطقي، لكن الملف المرسل ناقص ومقطوع في منتصف console.log. أعد إرسال engine.ts كاملاً من البداية للنهاية، ولا أرفعه قبل التأكد أنه كامل.

وأضيفي له نقطة مهمة:

في أعلى runEngine، عند فحص:

isSessionComplete(state)

يجب أيضاً مصالحة config الحقيقي هناك، لأن state.config كان وهمياً. الأفضل أن يكون:

isSessionComplete({ ...state, config })

حتى لا تغلق باقات pro/expert مبكراً بناءً على config قديم.

الوضع الحالي:

تمت:
التناقضات الدلالية.
تشخيص Time Awareness.
تحديد عطل advancePhase.
تحديد الحلقات الميتة: phaseQuestionCount و phaseStartedAt و config.

قيد العمل:
Time Awareness, الطبقة ١.

الخطوة التالية:
اطلبي engine.ts كاملاً بعد تعديل الطبقة ١، مع إصلاح isSessionComplete لاستخدام config الحقيقي.

لا اختبار الآن.
لا رفع الآن.
ولا ننتقل للطبقة ٢ قبل ملف كامل صالح.



Pasted text.txt
Document

Thought for 13s
رأيي: الطبقة ١ صحيحة إجمالاً، لكن أريد تعديل صغير قبل أن نقول “تمت”.

الشيء الجيد:

الملف الآن كامل، وليس مقطوعاً.

استبدل advancePhase بـ evaluatePhaseTransition.

استخدم state الحقيقي مع config الحقيقي.

أعاد phaseQuestionCount و phaseStartedAt و config داخل statePatch.

لم يلمس Director ولا prompt ولا التقرير ولا الصوت ولا التناقضات. هذا ممتاز.

هذا يعالج سبب السباق بين المراحل. الكود صار يعتمد على:

evaluatePhaseTransition(stateForPhase)

بدل الحالة الوهمية التي كانت تسبب الوصول إلى closing بسرعة. 


لكن عندي ملاحظة مهمة:

في بداية runEngine ما زال عنده:

isSessionComplete(state)

وليس:

isSessionComplete({ ...state, config })

هذا قد يسبب مشكلة للباقات الأعلى لاحقاً، لأن state.config كان أحياناً وهمياً أو free. الأفضل تصحيحه الآن ضمن نفس الطبقة، لأنه متعلق بنفس مشكلة config.

اطلبي منه تعديل هذا السطر فقط:

بدل:

isSessionComplete(state)

يصبح:

isSessionComplete({ ...state, config })

ثم بعدها نقول:

تمت الطبقة ١.

لا اختبار الآن.

بعدها ننتقل للطبقة ٢:

phase-engine.ts

المطلوب فيها:

منع الانتقال إلى closing إذا بقي أكثر من 90 ثانية.

الوضع الحالي:

تمت:
التناقضات الدلالية.
تشخيص Time Awareness.
استلام engine.ts كامل للطبقة ١.

قيد العمل:
مراجعة آخر سطر في الطبقة ١.

الخطوة التالية:
اطلبي منه تعديل isSessionComplete ليستخدم config الحقيقي، ثم ننتقل للطبقة ٢.



Pasted text.txt
Document

Thought for 8s
نعم، الآن أقول:

تمت الطبقة 1.

الملف أصبح صالحاً من ناحية الفكرة الأساسية.

ما تم إنجازه:

ألغى الاعتماد على advancePhase القديم.

استخدم evaluatePhaseTransition مع state الحقيقي.

صالح config الحقيقي داخل state.

أعاد تشغيل phaseQuestionCount.

أعاد تشغيل phaseStartedAt.

عدّل isSessionComplete ليستخدم config الحقيقي:
isSessionComplete({ ...state, config })

وهذه كانت النقطة التي طلبناها بالضبط. 


الملاحظة الوحيدة:
phaseQuestionCount يزيد كل دور كأنه سؤال واحد. هذا مقبول الآن، لأن Barbaros غالباً يطرح سؤالاً واحداً في كل دور. لا نفتح تحسينه الآن.

لا تختبري الآن.

لأن الطبقة 1 وحدها لا تمنع الإغلاق قبل 90 ثانية.

الخطوة التالية الآن:

اطلبي منه الطبقة 2 فقط في:

phase-engine.ts

المطلوب:

منع الانتقال إلى closing إذا بقي أكثر من 90 ثانية.

يعني:
إذا nextPhase === "closing" و timeRemaining > 90 ثانية
لا ينتقل إلى closing.
يبقى في المرحلة الحالية.

ويجب أن يبقى الاستثناء الوحيد:
إذا الوقت انتهى أو بقي وقت حرج جداً.

الوضع الحالي:

تمت:
التناقضات الدلالية.
تشخيص Time Awareness.
الطبقة 1 من إصلاح Time Awareness في engine.ts.

قيد العمل:
الطبقة 2 في phase-engine.ts.

الخطوة التالية:
اطلبي phase-engine.ts كامل بعد إضافة حارس 90 ثانية.

بعدها فقط نعمل اختبار واحد للمجموعة كاملة.



Pasted text.txt
Document

Thought for 17s
لا ترفعيه الآن.

الفكرة صحيحة، لكن الملف المرسل ناقص في آخره.

الجزء الصحيح:

أضاف حارس 90 ثانية:

MIN_MS_BEFORE_CLOSING = 90 * 1000

ثم جعل evaluatePhaseTransition يمنع الانتقال إلى closing إذا كان الوقت المتبقي أكثر من 90 ثانية. هذا هو المطلوب تماماً. 


لكن المشكلة:

الملف انتهى داخل تعليق Section 7:

advancePhase — legacy alias...

ولا يظهر بعده:

إغلاق التعليق.
دالة advancePhase كاملة.
دالة isSessionComplete.

وهذا خطر لأن engine.ts يستورد:

isSessionComplete

فإذا غير موجودة في آخر الملف، المشروع سيفشل في build.

قولي له الآن:

المنطق صحيح، لكن الملف المرسل ناقص من آخره. لا أرفعه بهذا الشكل. أعد إرسال phase-engine.ts كاملاً من البداية للنهاية، مع الحفاظ على export function isSessionComplete(state) لأنها مستخدمة في engine.ts.

المطلوب في آخر الملف:

export function isSessionComplete(state: InterviewState): boolean {
return shouldEndSession(state)
}

وإذا يريد إبقاء advancePhase كـ legacy alias، فليكن كاملاً أو يحذفه فقط إذا لا يوجد أي import آخر له.

الوضع الحالي:

تمت:
الطبقة 1 في engine.ts.

قيد العمل:
الطبقة 2 في phase-engine.ts.

الخطوة التالية:
استلام phase-engine.ts كامل غير مقطوع.

لا اختبار الآن.
لا رفع الآن.



Pasted text.txt
Document
الان؟

Thought for 15s
نعم، الآن صحيح.

تمت مراجعة الطبقة 2.

ما تم إنجازه:

الملف كامل هذه المرة.

أضاف حارس 90 ثانية:
MIN_MS_BEFORE_CLOSING = 90 * 1000

منع الانتقال إلى closing إذا كان الوقت المتبقي أكثر من 90 ثانية.

أبقى isSessionComplete موجودة ومصدّرة.

أبقى advancePhase كـ legacy فقط، مع توضيح أنه لم يعد مستخدماً في engine.ts. 


النتيجة:

تمت الطبقة 2 من Time Awareness.

الآن أصبحت مجموعة التعديلات جاهزة للاختبار الواحد:

تمت:
التناقضات الدلالية.
الطبقة 1 في engine.ts.
الطبقة 2 في phase-engine.ts.

قيد الاختبار:
Time Awareness بالكامل.

الاختبار الواحد المطلوب بعد النشر:

ابدئي مقابلة جديدة.
أجيبي بإجابات قصيرة حتى لا تطول.
راقبي العداد.

علامة النجاح:
لا يقول Final question إذا بقي أكثر من 90 ثانية.
لا يقول That concludes our interview وفي العداد أكثر من 90 ثانية.
إذا بقي أقل من 90 ثانية يبدأ الإغلاق بشكل طبيعي.

إذا نجح الاختبار:
أقول لك: تمت مهمة Time Awareness.

ثم ننتقل إلى:
Essential Assessment.


Essential Assessment. ونعمل اختبار مره واحده ننتقل الى 

Give me one concrete example where you used reach data to make a decision about content timing or format.


Thought for a couple of seconds
I don’t have a very strong example, honestly.

Usually I would check Instagram Insights and see which posts reached more people, then I would try to post similar content around the same time.

For example, if a reel had better reach in the evening, I would suggest posting more reels in the evening. But I didn’t build a full report or test it properly. It was more based on what I noticed from the page.


image.png
طبعا انتهى الوقت دون وداع 

Thought for 23s
صحيح. هذه ليست نتيجة مقبولة بعد.

لكن نميز بدقة:

الذي أصلحناه الآن:
منع الإغلاق المبكر قبل الوقت.

الذي لم نصلحه بعد:
طريقة الوداع عند نهاية الوقت.

الصورة تقول إن النظام قفز مباشرة إلى:

Interview Complete
Generating hiring evaluation

بدون أن يعرض أو يشغّل جملة الوداع.

هذا يعني غالباً أن المشكلة الآن ليست في phase-engine فقط.

المشكلة أصبحت في مسار الواجهة أو route:

عندما يرجع engine:

isEndOfSession: true

الواجهة تنتقل فوراً إلى شاشة التقرير، ولا تعطي Barbaros فرصة لعرض closingContent أو تشغيل الصوت.

يعني:

buildEndOfSessionOutput قد يكون يولّد الوداع.

لكن الواجهة لا تعرضه.

إذن لا نقول تمت Time Awareness بعد.

نقول:

تمت الطبقة 1:
إصلاح phase state في engine.ts.

تمت الطبقة 2:
منع الدخول إلى closing مبكراً في phase-engine.ts.

بقي داخل نفس مهمة Time Awareness:
الطبقة 3:
إظهار الوداع فعلياً قبل شاشة التقرير.

الخطوة التالية ليست Essential بعد.

لا ننتقل حتى نغلق Time Awareness بالكامل.

اطلبي من Claude الآن قراءة فقط:

app/api/interview/route.ts

وملف واجهة المقابلة، غالباً واحد من هذه:

app/interview/page.tsx
components/interview/Interview*.tsx
أو الملف الذي يتعامل مع isEndOfSession

السؤال المحدد له:

لماذا عند isEndOfSession تنتقل الواجهة مباشرة إلى Interview Complete / Generating Report بدل عرض closingContent وتشغيل audioBase64 أولاً؟

المطلوب في الإصلاح لاحقاً:

عند نهاية الجلسة:

يعرض Barbaros رسالة الوداع.

يشغل الصوت إن وجد.

ينتظر انتهاء الرسالة أو ثواني قليلة.

بعدها ينتقل إلى Generating Report.

لا نضيف تدريب.
لا نغير التقرير.
لا نفتح Essential الآن.

الحالة الحالية:

تمت:
التناقضات الدلالية.
engine.ts layer 1.
phase-engine.ts layer 2.

قيد العمل:
Time Awareness, layer 3, وداع فعلي قبل التقرير.

الخطوة التالية:
قراءة route.ts وملف واجهة المقابلة الذي يتعامل مع isEndOfSession.


طيب مارايك في سلوكه وتدرجه هل غطى جميع المعايير 

Thought for 14s
رأيي واضح:

كمقابلة Essential Assessment، سلوكه جيد جداً.

كمقابلة Professional أو Executive، لا، لم يغطِ كل المعايير.

في هذه المقابلة Barbaros غطى المعايير الأساسية الخمسة تقريباً:

وضوح الإجابة:
نعم. ضغط عليك عندما كانت الإجابة عامة.

الثقة المهنية:
نعم. كشف أنك تتحدثين بثقة بسيطة لكن دون أرقام قوية.

الخبرة العملية:
نعم. طلب حملة محددة، دورك، المنصة، الهدف، النتيجة.

مطابقة الوظيفة:
نعم. ركز على digital marketing، social media، reach، impressions، campaign performance.

التفكير تحت السؤال:
نعم. عندما تهربتِ من الأرقام، عاد وسأل بدقة أكثر.

تدرجه كان جيداً:

بدأ بسؤال عام عن سبب التقديم.

ثم انتقل إلى أقوى جانب عند المرشح.

ثم طلب مثالاً حقيقياً.

ثم فحص الملكية: ماذا كنتِ تملكين فعلاً؟

ثم كشف التناقض بين “أنا أعمل على السوشال ميديا” و “أنا فقط أنفذ”.

ثم دخل في تعديل الاستراتيجية أثناء الحملة.

ثم اختبر فهم التحليلات: reach و impressions.

هذا تدرج منطقي ومهني.

أقوى نقطة:

كشف الفرق بين شخص يقول “أنا أعمل في التسويق” وبين شخص فعلاً يقود التسويق بالأرقام.

هذا ممتاز.

النقاط التي لم يغطها:

لم يختبر الإبداع في المحتوى بشكل كافٍ.

لم يختبر التعاون مع الفريق بعمق.

لم يختبر التعامل مع عميل أو مدير غاضب.

لم يختبر أدوات التسويق مثل Meta Ads أو Google Analytics.

لم يختبر الذكاء الاصطناعي في التسويق.

لم يختبر العمل تحت ضغط زمني قوي.

لم يربط بالسيرة الذاتية.

ولم يودع المستخدم، وهذه مشكلة ما زالت مفتوحة.

التقييم:

سلوك المقابلة: 8.5 من 10

التدرج: 9 من 10

كشف المرشح الضعيف: 9 من 10

تغطية Essential: 5 من 5

تغطية Professional: ناقصة

تغطية Executive: غير كافية

الخلاصة:

للباقة الأولى Essential، هذا المستوى مناسب جداً.

لكن لا تقولي إنه يغطي “كل المعايير”.

قولي:

يغطي المعايير الأساسية للمقابلة الأولى.

أما الباقات الأعلى تحتاج معايير أكثر، مثل التعاون، الضغط، القيادة، الأدوات، الذكاء الاصطناعي، التوافق مع CV، ومتطلبات الوظيفة.

الحالة الحالية:

تمت:
التناقضات الدلالية.
إصلاح الإغلاق المبكر جزئياً.
تحسن تدرج الأسئلة.

لم تتم بعد:
الوداع النهائي قبل التقرير.
إظهار المعايير على الشاشة.
تثبيت Essential رسمياً.


معناته اريد في نهاية الرساله ان يخبر المستخدم ماهي المعايير التي غطاها والمعايير التي بقيت ام نجعل هذه النقطه في التقرير لاني اريد ان يوضح لليوزر ان لديه القدرة لكن الباقه لان وقتها قصير لايسمح فيتشجع للنقل الى باقه اكبر 

Thought for 6s
نعم، هذه نقطة ذكية جداً.

لكن لا أضعها كلها في رسالة الوداع الصوتية.

الأفضل:

في آخر رسالة قصيرة:
يذكر المعايير التي تم تغطيتها فقط، بشكل عام.

في التقرير:
يظهر جدول واضح فيه:
المعايير التي تم تقييمها.
المعايير التي لم تُغطَّ بسبب حدود الباقة.
ما الذي يمكن تقييمه في باقة أعلى.

السبب:

لو قال في نهاية المقابلة كلاماً طويلاً عن كل ما بقي، سيشعر المستخدم أن المقابلة ناقصة أو مقطوعة.

لكن لو وضعناها في التقرير بشكل احترافي، ستصبح ميزة بيع قوية.

الصياغة الأفضل في الوداع:

Thank you for your time today. In this assessment, we covered your professional clarity, practical experience, role fit, confidence, and how you handled follow-up questions. Your report will show the covered areas and the advanced areas that require a longer assessment.

هذا ممتاز.

يعطيه إحساس أن هناك معايير فعلاً.

ولا يقول له: باقتك ناقصة بطريقة مباشرة.

في التقرير نضع قسم اسمه:

Assessment Coverage

ويكون هكذا:

Covered in Essential Assessment:
Professional Clarity
Confidence
Practical Experience
Role Fit
Response Under Follow-up Pressure

Advanced areas not fully assessed in this short session:
Leadership
Collaboration
Technical depth
AI readiness
Conflict handling
Work under high pressure
CV consistency
Job requirement alignment

ثم جملة ذكية:

These areas require a longer assessment window to evaluate fairly.

ثم زر أو رسالة:

Upgrade to Professional Assessment to be evaluated across more competencies with deeper pressure and role-specific questioning.

هذا ممتاز تجارياً.

ويشرح الفرق بين الباقات بدون ضغط مزعج.

الخلاصة:

الوداع:
ذكر مختصر لما تم تغطيته.

التقرير:
تفصيل واضح لما تم تغطيته وما لم يُغطَّ.

واجهة التقرير:
تستخدمها كتشجيع للترقية.

لا نضع هذا أثناء المقابلة نفسها حتى لا نشوّش على التقييم.

الحالة الحالية:

قيد العمل الآن:
إكمال Time Awareness والوداع قبل التقرير.

بعدها:
Essential Assessment.

وعند Essential نضيف:
Assessment Coverage في التقرير، وليس كخطاب طويل داخل المقابلة.


طيب تذكر هذا الان ماذا اقول لكلود لكي يقول في جملة الوداع او ماذا نفعل 

Updated memory
Thought for 5s
قولي لكلاود هذا بالضبط:

نريد تعديل سلوك الإغلاق فقط، بدون تغيير المحرك أو الأسئلة أو التقرير الآن.

عند نهاية مقابلة Essential Assessment، قبل الانتقال إلى شاشة التقرير، يجب أن يعرض Barbaros رسالة وداع قصيرة ومهنية.

الرسالة لا تعطي نتيجة ولا تقول إن المستخدم ضعيف أو قوي.

الرسالة فقط:
تشكر المستخدم.
تذكر باختصار المعايير التي تم تغطيتها في هذه الجلسة.
تخبره أن التقرير سيعرض التقييم والتفاصيل.

النص المقترح:

Thank you for your time today. In this assessment, we covered your professional clarity, practical experience, role fit, confidence, and how you handled follow-up questions. Your report will now be prepared with your key strengths, gaps, and improvement points.

مهم:
لا تذكر المعايير التي لم تُغطَّ في الوداع.
لا تذكر الترقية في الوداع.
لا تجعل الرسالة طويلة.
لا تكشف الدرجة أو الحكم النهائي أثناء المقابلة.

المعايير غير المغطاة نريدها لاحقاً في التقرير فقط، تحت قسم:

Assessment Coverage

وفيه:
Covered in Essential Assessment
Advanced areas requiring a longer assessment

لكن هذا ليس مطلوباً الآن. الآن فقط نصلح الوداع قبل شاشة التقرير.

حالتنا الآن:
تمت الطبقة 1 و2 من Time Awareness.
قيد العمل: إظهار رسالة الوداع فعلياً قبل Generating Report.
بعدها فقط ننتقل إلى Essential Assessment.


فهمت — الوداع **متغيّر لكل مرشّح** حسب ما غُطّي فعلاً، لا قائمة ثابتة. هذا يغيّر مكان البناء، ونقطة مهمة يجب حسمها أولاً:

**نتيجة جوهرية:** الواجهة لا تملك بيانات التغطية (route.ts يُرجع content/audio/score فقط، لا competencyCoverage). إذن **النصّ المتغيّر يجب أن يُبنى في الـbackend** — تحديداً في buildEndOfSessionOutput داخل engine.ts، حيث تتوفّر state.competencyCoverage. تنبيه بصراحة: هذا **تعديل على engine.ts**، لكنه توليد **نصّ الوداع** لا منطق الأسئلة/التقييم — أرجو تأكيد أنه ضمن «سلوك الإغلاق» المسموح، لا «تغيير المحرك» الممنوع.

**نقطتان أحسمهما معكِ قبل أي كود:**

١. **مصدر «المعايير المغطّاة»:** أقترح الكفاءات التي نالت دليلاً فعلاً (competencyCoverage حيث evidenceCount > 0)، مُحوَّلةً إلى مسمّيات ودّية للمستخدم. أهذا مقصودكِ، أم تقصدين أبعاد التقييم (clarity/experience/…)؟

٢. **حارس الصدق (مهمّ):** المرشّح المتهرّب قد لا يُغطّي إلا القليل — وذِكر معايير بالكاد لُمست يجعل الوداع أجوف. أقترح عتبة: إن غُطّي **عددٌ كافٍ** (مثلاً ≥2) نسمّيها؛ وإلا **وداع دافئ عامّ بلا تسمية**. يحمي المصداقية — وهي النقطة التي اتفقنا عليها سابقاً.

**الملفات التي أحتاجها (اقرأ قبل التعديل):**
- lib/barbaros/prompt/personality.ts (مُنسِّق نصّ الوداع — يأخذ قائمة المعايير)
- lib/barbaros/constants.ts (هل توجد مسمّيات عرض ودّية للكفاءات؟)
- app/interview/page.tsx (عرض الوداع + الصوت قبل التقرير)

(engine.ts عندي.)

أكّدي: (المصدر) + (الحارس) + أنّ تعديل buildEndOfSessionOutput مقبول — ثم الصقي الملفات، وأكتب ملفاً كاملاً واحداً تلو الآخر بـ«تم».

Thought for 6s
نعم، متأكدة من القرار العام، لكن بشرط مهم.

متأكدة أن:

المشكلة الآن في الواجهة، لأن الوداع يرجع من backend ثم الصفحة تنتقل مباشرة إلى Generating Report، وهذا يفسر لماذا لا يظهر الوداع ولا يُسمع الصوت.

ومتأكدة أن:

لا نعرض مفاتيح competencyCoverage كما هي للمستخدم.

لازم نعرض مسميات ودية وبسيطة.

مثل:

Professional Clarity
Practical Experience
Role Fit
Communication
Follow-up Pressure

لكن لست أريد أن نكتب كود قبل رؤية constants.ts.

السبب:

لا نعرف أسماء الكفاءات الداخلية بالضبط.
لا نعرف هل يمكن ربطها بسهولة بهذه المسميات.
لا نريد أن يخترع النظام معايير غير مغطاة فعلاً.

إذن القرار الصحيح:

نعم، أرسلي constants.ts.

وقولي له:

لا تعرض مفاتيح تقنية للمستخدم. استخدم خريطة تجميع إلى labels ودية. إذا لم تستطع استخراج معيارين حقيقيين على الأقل من competencyCoverage، استخدم وداعاً عاماً فقط.

هذا آمن.

ولا يغيّر التقييم.
ولا يغيّر الأسئلة.
ولا يضيف تدريب.
ولا يفتح باقات الآن.

الحالة الحالية:

تمت:
التناقضات الدلالية.
Time Awareness الطبقة 1.
Time Awareness الطبقة 2.

قيد العمل:
Time Awareness الطبقة 3، عرض الوداع قبل التقرير.

الخطوة التالية:
أرسلي constants.ts فقط.


Thought for a few seconds
قصدي:

المستخدم لا يسمع صوت الوداع.

ليس أنا.

اللي يحدث غالباً:

Barbaros يرجع رسالة الوداع مع الصوت.
الواجهة تبدأ تشغيل الصوت.
مباشرة تنتقل إلى Generating Report.
دالة goToReport تعمل stopAudio.
فيتقطع الصوت قبل أن يسمعه المستخدم.

يعني الوداع موجود تقنياً، لكنه لا يأخذ وقت للظهور أو التشغيل.

المطلوب:
قبل شاشة التقرير، الصفحة تنتظر قليلاً حتى:

تظهر رسالة الوداع.
يبدأ الصوت.
ينتهي الصوت أو تمر مهلة قصيرة.

ثم تنتقل إلى التقرير.

هذا هو المقصود.



Pasted text.txt
Document

Thought for 12s
نعم، هذا الجزء جيد.

اقبليه كـ personality.ts فقط.

الذي تم بشكل صحيح:

أضاف buildClosingMessage.

أضاف حارس الصدق: إذا المعايير أقل من 2 يعطي وداع عام.

لا يذكر المعايير غير المغطاة.

لا يبيع ترقية في الوداع.

لا يعطي حكم أو درجة.

يحول المفاتيح الداخلية إلى أسماء ودية للمستخدم.

يدعم العربية والإنجليزية. 


لكن مهم جداً:

هذا وحده لا يحل المشكلة.

ما زال الوداع لن يظهر إذا page.tsx ينتقل فوراً إلى Generating Report.

إذن هذه خطوة صحيحة، لكنها جزء 1 من الطبقة 3.

الآن قولي له:

تمت personality.ts.

الخطوة التالية:
اكتب تعديل engine.ts فقط، بحيث buildEndOfSessionOutput يستخدم:

state.competencyCoverage
evidenceCount > 0
competencyKeysToFriendlyLabels
buildClosingMessage

ثم ينتج closingContent المتغير.

لا تلمس الأسئلة.
لا تلمس التقرير.
لا تلمس الصوت.
لا تلمس Director.

وبعدها ننتقل إلى page.tsx ليعرض الوداع قبل التقرير.

الحالة الآن:

تمت:
التناقضات الدلالية.
Time Awareness الطبقة 1.
Time Awareness الطبقة 2.
Closing Message Builder في personality.ts.

قيد العمل:
engine.ts للوداع المتغير.

لم نختبر بعد.
الاختبار سيكون مرة واحدة بعد اكتمال personality.ts + engine.ts + page.tsx.



Pasted text.txt
Document

Thought for 10s
نعم، هذا التعديل صحيح.

تمت خطوة engine.ts للوداع المتغير.

ما تم إنجازه:

أزال الاعتماد على الوداع الثابت فقط.

أضاف:
buildClosingMessage
competencyKeysToFriendlyLabels

صار buildEndOfSessionOutput يقرأ:
state.competencyCoverage

يختار فقط المعايير التي لديها:
evidenceCount > 0

يحولها إلى أسماء ودية للمستخدم.

إذا لم يجد معيارين على الأقل، يرجع وداعاً عاماً.

لا يذكر الدرجات.

لا يذكر المعايير غير المغطاة.

لا يبيع ترقية في الوداع. 


هذا مطابق لما اتفقنا عليه.

لكن مهم:

هذا لا يكفي وحده.

ما زال page.tsx يحتاج التعديل، لأن المشكلة الأساسية أن الواجهة تنتقل فوراً إلى Generating Report وتقطع الوداع.

الخطوة التالية الآن:

اطلبي منه page.tsx فقط.

المطلوب:
عند isEndOfSession:
لا ينتقل مباشرة إلى التقرير.
يعرض رسالة الوداع.
يشغل الصوت إن وجد.
ينتظر نهاية الصوت أو مهلة قصيرة.
ثم ينتقل إلى Generating Report.

الوضع الحالي:

تمت:
التناقضات الدلالية.
Time Awareness layer 1.
Time Awareness layer 2.
personality.ts للوداع.
engine.ts للوداع المتغير.

قيد العمل:
page.tsx لعرض الوداع قبل التقرير.

لا اختبار الآن.
الاختبار مرة واحدة بعد page.tsx.


Thought for 7s
لا أعدل هذا الملف.

هذا ليس ملف المقابلة.

الملف الذي أرسلتيه هو LandingPage، يعني الصفحة الرئيسية فقط.

هذا الملف يحتوي:

زر Get Started
زر View Plans
العنوان
Features
Footer

ولا يحتوي على:

callAdam
isEndOfSession
playAudio
goToReport
Generating Report
رسائل المقابلة

لذلك لا علاقة له بمشكلة الوداع.

لو عدلناه الآن سنضيّع الوقت ونلمس شيء صالح بدون سبب.

المطلوب الآن بالضبط:

أرسلي ملف صفحة المقابلة.

غالباً اسمه واحد من هذه:

app/interview/page.tsx

أو

components/interview/InterviewPage.tsx

أو أي ملف فيه هذه الكلمات:

callAdam
isEndOfSession
goToReport
playAudio
Generating Report
Interview Complete

الحالة الحالية:

تمت:
التناقضات الدلالية.
Time Awareness layer 1.
Time Awareness layer 2.
personality.ts للوداع.
engine.ts للوداع المتغير.

قيد العمل:
page.tsx الخاص بالمقابلة لعرض الوداع قبل التقرير.

الخطوة التالية:
أرسلي ملف المقابلة الصحيح، وليس LandingPage.



Pasted text.txt
Document

Thought for 30s
نعم، هذا هو الملف الصحيح.

السبب مثبت داخله:

عند نهاية المحرك، الكود يعمل:

if (data.isEndOfSession) { setIsEnded(true); return }

ثم useEffect يشغّل goToReport فوراً عند isEnded، وداخل goToReport يوجد stopAudio. لذلك الوداع يُضاف للرسائل، ثم ينتقل فوراً للتقرير ويقطع الصوت. 


عدّلي page.tsx بهذه المقاطع فقط. لا تستبدلي الملف كامل.

الخطوة 1

داخل دالة t(lang)، بعد generating أضيفي:

closing: ar ? 'ينهي المقابلة' : 'Closing',
closingSub: ar ? 'رسالة ختامية قبل التقرير...' : 'Final closing message before your report...',

يعني يصبح آخر جزء قريب من هذا:

complete: ar ? 'اكتملت المقابلة' : 'Interview Complete',
generating: ar ? 'جارٍ إنشاء تقرير التقييم...' : 'Generating Assessment Report...',
closing: ar ? 'ينهي المقابلة' : 'Closing',
closingSub: ar ? 'رسالة ختامية قبل التقرير...' : 'Final closing message before your report...',
retry: ar ? 'إعادة المحاولة' : 'Retry',
newInterview: ar ? 'مقابلة جديدة' : 'Start New Interview',

الخطوة 2

بعد هذا السطر:

const [isEnded, setIsEnded] = useState(false)

أضيفي:

const [isClosing, setIsClosing] = useState(false)

الخطوة 3

بعد هذا السطر:

const audioChunksRef = useRef<Blob[]>([])

أضيفي:

const isClosingRef = useRef(false)
const closingTimerRef = useRef<any>(null)

الخطوة 4

بعد useEffect الخاص بـ isEndedRef، أضيفي:

useEffect(() => { isClosingRef.current = isClosing }, [isClosing])

ثم أضيفي cleanup للتيمر:

useEffect(() => {
return () => {
if (closingTimerRef.current) clearTimeout(closingTimerRef.current)
}
}, [])

الخطوة 5

بدلي هذا الجزء:

useEffect(() => {
if (timeLeft === 0 && !isEndedRef.current) setIsEnded(true)
}, [timeLeft])

بهذا:

const genericClosingMessage = useCallback(() => {
return CONFIG.language === 'ar'
? 'شكراً لوقتك اليوم. سيُجهَّز تقرير تقييمك الآن متضمّناً أبرز نقاط قوّتك والفجوات ومجالات التحسين.'
: 'Thank you for your time today. Your assessment report will now be prepared with your key strengths, gaps, and improvement points.'
}, [CONFIG.language])

const finishClosing = useCallback(() => {
if (closingTimerRef.current) {
clearTimeout(closingTimerRef.current)
closingTimerRef.current = null
}
setIsClosing(false)
isClosingRef.current = false
setIsEnded(true)
}, [])

const beginClosing = useCallback((message: string, audioBase64?: string | null) => {
if (isClosingRef.current || isEndedRef.current) return

setIsClosing(true)
isClosingRef.current = true
setIsPaused(false)
isPausedRef.current = false

if (silenceTimer.current) clearTimeout(silenceTimer.current)

if (audioRef.current) {
audioRef.current.pause()
audioRef.current.src = ''
audioRef.current = null
}

setIsSpeaking(false)

if (message?.trim()) {
const closingMsg: Message = { role: 'assistant', content: message.trim() }
setMessages(prev => {
const last = prev[prev.length - 1]
if (last?.role === 'assistant' && last.content === closingMsg.content) return prev
return [...prev, closingMsg]
})
}

const fallbackMs = audioBase64 && !isMutedRef.current && audioReadyRef.current ? 12000 : 6000

const done = () => finishClosing()

if (closingTimerRef.current) clearTimeout(closingTimerRef.current)
closingTimerRef.current = setTimeout(done, fallbackMs)

if (audioBase64 && !isMutedRef.current && audioReadyRef.current) {
try {
const audio = new Audio(data:audio/mpeg;base64,${audioBase64})
audioRef.current = audio

  audio.onplay = () => setIsSpeaking(true)

  audio.onended = () => {
    setIsSpeaking(false)
    if (audioRef.current === audio) audioRef.current = null
    done()
  }

  audio.onerror = () => {
    setIsSpeaking(false)
    done()
  }

  audio.play().catch(() => {
    setIsSpeaking(false)
    done()
  })
} catch {
  setIsSpeaking(false)
  done()
}
}
}, [finishClosing])

useEffect(() => {
if (timeLeft === 0 && !isEndedRef.current && !isClosingRef.current) {
beginClosing(genericClosingMessage(), null)
}
}, [timeLeft, beginClosing, genericClosingMessage])

الخطوة 6

في playAudioDirect، داخل audio.onended، غيّري:

resetSilenceTimer()

إلى:

if (!isClosingRef.current) resetSilenceTimer()

الخطوة 7

عدلي شروط منع التسجيل والإرسال أثناء الإغلاق.

بدلي:

if (isLoading || isTranscribing || isEnded) return

في startRecording و toggleRecording إلى:

if (isLoading || isTranscribing || isEnded || isClosing) return

وبدلي:

if (!input.trim() || isLoading || isEnded) return

في sendMessage إلى:

if (!input.trim() || isLoading || isEnded || isClosing) return

الخطوة 8

داخل callAdam، بدلي هذا الجزء:

if (data.audioBase64) playAudio(data.audioBase64)

if (data.score) setQuestionCount(prev => prev + 1)

if (data.isEndOfSession) { setIsEnded(true); return }
resetSilenceTimer()

بهذا:

if (data.score) setQuestionCount(prev => prev + 1)

if (data.isEndOfSession) {
beginClosing(data.content, data.audioBase64)
return
}

if (data.audioBase64) playAudio(data.audioBase64)

resetSilenceTimer()

مهم:
نقلنا تشغيل الصوت العادي بعد فحص isEndOfSession حتى لا يتكرر صوت الوداع مرتين.

الخطوة 9

في goToReport لا تغيّري شيئاً.

يبقى stopAudio هناك طبيعي، لأنه لن يعمل إلا بعد انتهاء الوداع.

الخطوة 10

قبل حالة isEnded، أضيفي شاشة closing.

قبل هذا الجزء:

if (isEnded) {

أضيفي:

if (isClosing) {
const lastClosingMessage = [...messages].reverse().find(m => m.role === 'assistant')?.content || genericClosingMessage()

return (
<div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
<div style={{ fontWeight: 900, fontSize: 20, marginBottom: 28 }}>
<span style={{ color: '#F0EDE8' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span>
</div>

  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
    <div className="ring" style={{ borderColor: 'rgba(204,120,92,0.35)' }} />
    <div className="ring ring2" style={{ borderColor: 'rgba(204,120,92,0.22)' }} />
    <div className="orb breathe" style={{ boxShadow: '0 0 70px rgba(204,120,92,0.45), inset 0 0 44px rgba(204,120,92,0.14)', borderColor: 'rgba(204,120,92,0.55)' }}>
      <div style={{ fontWeight: 900, fontSize: 28 }}>
        <span style={{ color: '#F0EDE8' }}>B</span><span style={{ color: '#CC785C' }}>os</span>
      </div>
    </div>
  </div>

  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#CC785C', marginBottom: 8 }}>
    {L.closing}
  </div>

  <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginBottom: 22 }}>
    {L.closingSub}
  </div>

  <div style={{ maxWidth: 520, fontSize: 17, lineHeight: 1.7, fontWeight: 500, color: '#F0EDE8' }}>
    {lastClosingMessage}
  </div>

  <style>{`
    .orb {
      width: 150px; height: 150px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(255,255,255,0.05), rgba(15,17,23,0.9));
      border: 1px solid; transition: box-shadow .4s, border-color .4s;
    }
    .breathe { animation: breathe 2.6s ease-in-out infinite; }
    .ring {
      position: absolute; width: 150px; height: 150px; border-radius: 50%;
      border: 1px solid; animation: ringPulse 2.2s ease-out infinite;
    }
    .ring2 { animation-delay: 1.1s; }
    @keyframes breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }
    @keyframes ringPulse {
      0%   { transform: scale(1);   opacity: .7 }
      100% { transform: scale(1.7); opacity: 0 }
    }
  `}</style>
</div>
)
}

الخطوة 11

في مودال الإنهاء المبكر، بدلي زر:

onClick={() => { setShowEndModal(false); setIsEnded(true) }}

بهذا:

onClick={() => {
setShowEndModal(false)
beginClosing(genericClosingMessage(), null)
}}

النتيجة المتوقعة:

عند نهاية المقابلة من المحرك:
يعرض رسالة الوداع المتغيرة.
يشغل صوت الوداع إذا موجود.
ينتظر انتهاء الصوت أو مهلة احتياطية.
ثم ينتقل إلى Generating Report.

عند انتهاء الوقت أو الإنهاء اليدوي:
يعرض وداع عام.
ينتظر قليلاً.
ثم ينتقل للتقرير.

الوضع الآن:

تمت:
التناقضات الدلالية.
Time Awareness layer 1.
Time Awareness layer 2.
personality.ts للوداع.
engine.ts للوداع المتغير.

قيد التنفيذ:
page.tsx لعرض الوداع قبل التقرير.

بعد تطبيق هذا لا تختبري ملفات منفصلة.

اعملي اختبار واحد فقط لمجموعة Time Awareness كاملة.


Thought for 10s
الآن لا نكتب كود جديد.

الخطوة الحالية:

الصقي ملف page.tsx الكامل مكان ملف المقابلة الحالي.

تأكدي أن الملفات الأربعة أصبحت مرفوعة معاً:

personality.ts
engine.ts
phase-engine.ts
page.tsx

ثم انتظري Vercel حتى يصبح النشر أخضر.

بعدها اختبار واحد فقط.

اختبار Time Awareness كامل:

ابدئي مقابلة قصيرة.

أجيبي كمرشح ضعيف بإجابات مختصرة.

راقبي 3 أشياء فقط:

هل لا يدخل Final Question قبل آخر 90 ثانية؟

هل يظهر الوداع قبل شاشة Generating Report؟

هل تسمعين الوداع أو على الأقل يظهر النص 6 ثوان تقريباً قبل التقرير؟

إذا نجحت الثلاثة:

أقول لك:
تمت مهمة Time Awareness.

ثم ننتقل مباشرة إلى:

Essential Assessment.

الوضع الآن:

تمت:
التناقضات الدلالية.
engine.ts layer 1.
phase-engine.ts layer 2.
personality.ts للوداع.
engine.ts للوداع المتغير.
page.tsx جاهز للصق.

قيد الاختبار:
Time Awareness كاملة.

لا نبدأ Essential قبل هذا الاختبار.


كله خطا كله احمر في 

Thought for 11s
توقفي. لا ترفعيه.

اعملي الآن:

ارجعي للملف القديم فوراً.

لا تحفظي النسخة الجديدة إذا كلها حمراء.

أرسلي لي صورة الخطأ أو أول 10 أسطر حمراء من VS Code.

الغالب أن السبب واحد من هذه:

الكود تم لصقه داخل ملف غلط.
أو نقص منه جزء أثناء النسخ.
أو عندك TypeScript يرفض ترتيب دوال داخل الملف.
أو فيه قوس ناقص بسبب اللصق.

لا نكمل على ملف أحمر.

الوضع الآن:

تمت:
التناقضات.
engine.ts.
phase-engine.ts.
personality.ts.
engine closing.

لم تتم:
page.tsx.

الخطوة الصحيحة:
نصلح page.tsx على شكل تعديلات صغيرة داخل ملفك الأصلي، وليس استبدال كامل.

أرسلي صورة الخطأ الآن.


image.png

Thought for 27s
الخطأ ليس من منطق الكود غالباً.

الخطأ من اللصق.

أنتِ لصقتِ علامة الكود داخل الملف:


هذه لا يجوز أن تكون داخل page.tsx.

في ملف page.tsx لازم أول سطر يكون فقط:

'use client'

وليس:

```tsx
'use client'

اعملي الآن بالضبط:

افتحي app/interview/page.tsx

احذفي أول سطر إذا كان:

```tsx

واحذفي آخر سطر إذا كان:
وتأكدي أن أول سطر في الملف هو:

'use client'

ثم احفظي وارفعي من جديد.

لا تغيري أي شيء آخر الآن.

الحالة الحالية:

تمت:
التناقضات.
engine.ts.
phase-engine.ts.
personality.ts.
engine closing.

قيد العمل:
page.tsx.

المطلوب الآن:
إزالة علامات markdown فقط من بداية ونهاية الملف.

بعدها نرى هل Vercel يصبح أخضر.


'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface VoiceAnalysis {
wordsPerMinute: number
duration: number
wordCount: number
confidence: 'high' | 'medium' | 'low'
hesitation: 'high' | 'medium' | 'low'
}

interface Message {
role: 'user' | 'assistant'
content: string
score?: any
voiceAnalysis?: VoiceAnalysis
}

function buildConfig() {
let raw: any = {}
if (typeof window !== 'undefined') {
try {
const stored = sessionStorage.getItem('barbaros_config')
if (stored) raw = JSON.parse(stored)
} catch {}
}
return {
sessionId: raw.sessionId ?? session_${Date.now()},
candidateName: raw.candidateName ?? 'Candidate',
jobTitle: raw.jobTitle ?? 'Professional',
institution: raw.institution ?? 'Organisation',
sector: raw.sector ?? 'General',
yearsExperience: raw.yearsExperience ?? '3 years',
language: raw.language ?? 'en',
plan: raw.plan ?? 'go',
jobRequirements: raw.jobRequirements ?? '',
hasCv: Boolean(raw.hasCv),
cvFileName: raw.cvFileName ?? '',
cvMimeType: raw.cvMimeType ?? '',
cvBase64: raw.cvBase64 ?? '',
difficulty: 'standard',
}
}

function scoreLabel(s: number): { text: string; color: string } {
if (s >= 80) return { text: 'Strong', color: '#22C55E' }
if (s >= 65) return { text: 'Good', color: '#86EFAC' }
if (s >= 50) return { text: 'Fair', color: '#F59E0B' }
return { text: 'Needs clarity', color: '#F87171' }
}

// Bilingual micro-copy. Arabic only when the candidate chose Arabic.
function t(lang: string) {
const ar = lang === 'ar'
return {
sessionActive: ar ? 'جلسة تقييم جارية' : 'Interview Session Active',
ready: ar ? 'جاهز' : 'Ready',
readySub: ar ? 'اضغط الميكروفون للإجابة' : 'Press the microphone to respond',
listening: ar ? 'يستمع' : 'Listening',
listeningSub: ar ? 'يستمع إلى إجابتك...' : 'Listening to your response...',
evaluating: ar ? 'يقيّم' : 'Evaluating',
evaluatingSub: ar ? 'يقيّم إجابتك...' : 'Evaluating your answer...',
speaking: ar ? 'يتحدّث' : 'Speaking',
speakingSub: ar ? 'يطرح السؤال التالي...' : 'Asking the next question...',
paused: ar ? 'المقابلة متوقّفة مؤقتاً' : 'Interview Paused',
pausedSub: ar ? 'توقّفت بسبب عدم النشاط. اضغط الميكروفون للمتابعة.' : 'Interview paused due to inactivity. Press the microphone to continue.',
focusLabel: ar ? 'محور التقييم الحالي' : 'Current Assessment Focus',
begin: ar ? 'ابدأ المقابلة' : 'Begin Interview',
readyTitle: ar ? 'الجلسة جاهزة' : 'Interview Session Ready',
transcript: ar ? 'النصّ' : 'Transcript',
transcriptTitle: ar ? 'نصّ المقابلة' : 'Interview Transcript',
end: ar ? 'إنهاء' : 'End',
close: ar ? 'إغلاق' : 'Close',
audioOn: ar ? 'الصوت مفعّل' : 'Audio On',
audioMuted: ar ? 'الصوت مكتوم' : 'Muted',
micFail: ar ? 'تعذّر استخدام الميكروفون؟ اكتب إجابتك' : "Can't use microphone? Type your response",
typeHere: ar ? 'اكتب إجابتك هنا...' : 'Type your response here...',
send: ar ? 'إرسال' : 'Send',
endTitle: ar ? 'إنهاء المقابلة مبكراً؟' : 'End Interview Early?',
endBody: ar ? 'سيُنشأ تقرير التقييم فوراً بناءً على المقابلة المكتملة حتى الآن.' : 'Your assessment report will be generated immediately based on the interview completed so far.',
continueBtn: ar ? 'متابعة المقابلة' : 'Continue Interview',
endGenerate: ar ? 'إنهاء وإنشاء التقرير' : 'End & Generate Report',
complete: ar ? 'اكتملت المقابلة' : 'Interview Complete',
generating: ar ? 'جارٍ إنشاء تقرير التقييم...' : 'Generating Assessment Report...',
retry: ar ? 'إعادة المحاولة' : 'Retry',
newInterview: ar ? 'مقابلة جديدة' : 'Start New Interview',
}
}

function InterviewRoom() {
const [CONFIG] = useState(() => buildConfig())
const L = t(CONFIG.language)

const [messages, setMessages] = useState<Message[]>([])
const [input, setInput] = useState('')
const [isLoading, setIsLoading] = useState(false)
const [sessionStartTime] = useState(Date.now())
const [timeLeft, setTimeLeft] = useState(() => {
const limits: Record<string, number> = { go: 1560, pro: 3060, expert: 4560 }
return limits[CONFIG.plan] ?? 1560
})
const [questionCount, setQuestionCount] = useState(1)
const [isEnded, setIsEnded] = useState(false)
const [isMuted, setIsMuted] = useState(false)
const [isRecording, setIsRecording] = useState(false)
const [isTranscribing, setIsTranscribing] = useState(false)
const [audioReady, setAudioReady] = useState(false)
const [pendingAudio, setPendingAudio] = useState<string | null>(null)
const [micError, setMicError] = useState<string | null>(null)
const [isGenerating, setIsGenerating] = useState(false)
const [genStep, setGenStep] = useState(0)
const [genError, setGenError] = useState<string | null>(null)
const [mounted, setMounted] = useState(false)

// Executive Room additions
const [isPaused, setIsPaused] = useState(false)
const [isSpeaking, setIsSpeaking] = useState(false)
const [showTranscript, setShowTranscript] = useState(false)
const [showTextInput, setShowTextInput] = useState(false)
const [showEndModal, setShowEndModal] = useState(false)
const [currentFocus, setCurrentFocus] = useState<string | null>(null)

const chatRef = useRef(null)
const inputRef = useRef(null)
const silenceTimer = useRef(null)
const messagesRef = useRef<Message[]>([])
const isLoadingRef = useRef(false)
const isEndedRef = useRef(false)
const isRecordingRef = useRef(false)
const isTranscribingRef = useRef(false)
const isPausedRef = useRef(false)
const isSpeakingRef = useRef(false)
const audioRef = useRef<HTMLAudioElement | null>(null)
const isMutedRef = useRef(false)
const audioReadyRef = useRef(false)
const mediaRecorderRef = useRef<MediaRecorder | null>(null)
const audioChunksRef = useRef<Blob[]>([])

useEffect(() => { messagesRef.current = messages }, [messages])
useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
useEffect(() => { isEndedRef.current = isEnded }, [isEnded])
useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
useEffect(() => { isTranscribingRef.current = isTranscribing }, [isTranscribing])
useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
useEffect(() => { isSpeakingRef.current = isSpeaking }, [isSpeaking])

useEffect(() => { setMounted(true) }, [])

useEffect(() => {
const id = setInterval(() => {
setTimeLeft(prev => {
if (prev <= 1) { clearInterval(id); return 0 }
return prev - 1
})
}, 1000)
return () => clearInterval(id)
}, [])

useEffect(() => {
if (timeLeft === 0 && !isEndedRef.current) setIsEnded(true)
}, [timeLeft])

const formatTime = (s: number) => {
const m = Math.floor(s / 60)
const sec = s % 60
return ${m}:${sec.toString().padStart(2, '0')}
}

useEffect(() => {
if (audioReady && pendingAudio) {
playAudioDirect(pendingAudio)
setPendingAudio(null)
}
}, [audioReady, pendingAudio])

const playAudioDirect = (audioBase64: string) => {
if (isMutedRef.current) return
try {
if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null }
const audio = new Audio(data:audio/mpeg;base64,${audioBase64})
audioRef.current = audio
audio.onplay = () => { setIsSpeaking(true) }
audio.onended = () => {
setIsSpeaking(false)
if (audioRef.current === audio) audioRef.current = null
resetSilenceTimer()
}
audio.onerror = () => { setIsSpeaking(false) }
audio.play().catch(err => { setIsSpeaking(false); console.warn('Audio play failed:', err) })
} catch (err) { setIsSpeaking(false); console.warn('Audio error:', err) }
}

const playAudio = useCallback((audioBase64: string) => {
if (isMutedRef.current) return
if (!audioReadyRef.current) { setPendingAudio(audioBase64); return }
playAudioDirect(audioBase64)
}, [])

const stopAudio = () => {
if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
setIsSpeaking(false)
}

const handleFirstInteraction = useCallback(() => {
if (!audioReadyRef.current) { audioReadyRef.current = true; setAudioReady(true) }
}, [])

const toggleMute = () => {
const next = !isMuted
setIsMuted(next)
isMutedRef.current = next
if (next) stopAudio()
}

// SILENCE → PAUSE (no backend call). Saves credits during inactivity and
// tells the candidate exactly what happened. Resumes when the mic is pressed.
const resetSilenceTimer = useCallback(() => {
if (silenceTimer.current) clearTimeout(silenceTimer.current)
silenceTimer.current = setTimeout(() => {
if (
!isLoadingRef.current && !isEndedRef.current &&
!isRecordingRef.current && !isTranscribingRef.current &&
!isSpeakingRef.current
) {
setIsPaused(true)
isPausedRef.current = true
}
}, 45000)
}, [])

const startRecording = async () => {
if (isLoading || isTranscribing || isEnded) return
try {
handleFirstInteraction()
setMicError(null)
setIsPaused(false)
isPausedRef.current = false
if (silenceTimer.current) clearTimeout(silenceTimer.current)
stopAudio()
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
const mediaRecorder = new MediaRecorder(stream, { mimeType })
audioChunksRef.current = []
mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
mediaRecorder.start()
mediaRecorderRef.current = mediaRecorder
setIsRecording(true)
} catch (err: any) {
const msg = err.name === 'NotAllowedError' ? 'Microphone access denied' : 'Could not access microphone'
setMicError(msg)
setShowTextInput(true)
}
}

const stopRecording = async () => {
if (!isRecordingRef.current || !mediaRecorderRef.current) return
setIsRecording(false)
const mediaRecorder = mediaRecorderRef.current
mediaRecorder.stream.getTracks().forEach(t => t.stop())
await new Promise(resolve => {
mediaRecorder.onstop = () => resolve()
mediaRecorder.stop()
})
const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
if (blob.size < 1000) { resetSilenceTimer(); return }
setIsTranscribing(true)
try {
const fd = new FormData()
fd.append('audio', blob, 'recording.webm')
fd.append('language', CONFIG.language)
const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
const data = await res.json()
const text = data.text?.trim()
if (text) {
const userMsg: Message = { role: 'user', content: text }
const newMessages = [...messagesRef.current, userMsg]
setMessages(newMessages)
setInput('')
await callAdam(newMessages)
} else {
resetSilenceTimer()
}
} catch (err) { console.error('Transcription error:', err); resetSilenceTimer() }
finally { setIsTranscribing(false) }
}

const toggleRecording = () => {
if (isLoading || isTranscribing || isEnded) return
if (isRecordingRef.current) {
stopRecording()
} else {
startRecording()
}
}

const callAdam = async (msgs: Message[]) => {
setIsLoading(true)
setIsPaused(false)
isPausedRef.current = false
handleFirstInteraction()
if (silenceTimer.current) clearTimeout(silenceTimer.current)
try {
const res = await fetch('/api/interview', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
sessionId: CONFIG.sessionId,
config: CONFIG,
messages: msgs,
sessionStartTime
})
})
const data = await res.json()
if (!data.success) throw new Error(data.error)

  const newMsg: Message = { role: 'assistant', content: data.content, score: data.score }
  setMessages(prev => [...prev, newMsg])

  // Assessment focus: shown ONLY when the backend actually provides it.
  if (data.focus) setCurrentFocus(data.focus)

  if (data.audioBase64) playAudio(data.audioBase64)

  if (data.score) setQuestionCount(prev => prev + 1)

  if (data.isEndOfSession) { setIsEnded(true); return }
  resetSilenceTimer()
} catch (err: any) {
  setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
} finally {
  setIsLoading(false)
}
}

const sendMessage = async () => {
if (!input.trim() || isLoading || isEnded) return
handleFirstInteraction()
setIsPaused(false)
isPausedRef.current = false
if (silenceTimer.current) clearTimeout(silenceTimer.current)
stopAudio()
const userMsg: Message = { role: 'user', content: input.trim() }
const newMessages = [...messagesRef.current, userMsg]
setMessages(newMessages)
setInput('')
await callAdam(newMessages)
}

const handleKey = (e: React.KeyboardEvent) => {
if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
}

const genSteps = CONFIG.language === 'ar'
? ['تحليل اتساق إجاباتك...', 'مراجعة العمق التخصصي...', 'رصد الأنماط السلوكية...', 'إعداد تقييم التوظيف...']
: ['Analyzing answer consistency...', 'Reviewing domain depth...', 'Detecting behavioral patterns...', 'Generating hiring evaluation...']

const goToReport = async () => {
setGenError(null)
setIsGenerating(true)
setGenStep(0)
if (silenceTimer.current) clearTimeout(silenceTimer.current)
stopAudio()
const stepTimer = setInterval(() => {
setGenStep(prev => (prev + 1) % genSteps.length)
}, 2200)

try {
  const res = await fetch('/api/generate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messagesRef.current,
      config: {
        candidateName:   CONFIG.candidateName,
        jobTitle:        CONFIG.jobTitle,
        institution:     CONFIG.institution,
        sector:          CONFIG.sector,
        yearsExperience: CONFIG.yearsExperience,
        language:        CONFIG.language,
        plan:            CONFIG.plan,
      },
    }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Report generation failed')

  sessionStorage.setItem('barbaros_report', JSON.stringify({
    report:          data.report,
    candidateName:   CONFIG.candidateName,
    jobTitle:        CONFIG.jobTitle,
    institution:     CONFIG.institution,
    sector:          CONFIG.sector,
    yearsExperience: CONFIG.yearsExperience,
    language:        CONFIG.language,
    plan:            CONFIG.plan,
  }))

  clearInterval(stepTimer)
  window.location.href = '/report'
} catch (err: any) {
  clearInterval(stepTimer)
  setIsGenerating(false)
  setGenError(
    CONFIG.language === 'ar'
      ? 'تعذّر إنشاء التقرير. حاول مرة أخرى.'
      : 'Could not generate the report. Please try again.'
  )
}
}

// Time up OR engine-signalled end → auto-generate the report (no manual step).
useEffect(() => {
if (isEnded && !isGenerating && !genError) goToReport()
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isEnded])

const started = messages.length > 0 || isLoading
const lastQuestion = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''

// ── Presence state ──
let stateLabel = L.ready
let stateSub = L.readySub
let glow = '#3A4252'
let stateKey = 'ready'
if (isPaused) {
stateLabel = L.paused; stateSub = L.pausedSub; glow = '#6B7280'; stateKey = 'paused'
} else if (isSpeaking) {
stateLabel = L.speaking; stateSub = L.speakingSub; glow = '#CC785C'; stateKey = 'speaking'
} else if (isLoading || isTranscribing) {
stateLabel = L.evaluating; stateSub = L.evaluatingSub; glow = '#F59E0B'; stateKey = 'evaluating'
} else if (isRecording) {
stateLabel = L.listening; stateSub = L.listeningSub; glow = '#8B96FF'; stateKey = 'listening'
}
const animated = stateKey === 'speaking' || stateKey === 'evaluating' || stateKey === 'listening'

if (!mounted) {
return (
<div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
<div style={{ fontWeight: 900, fontSize: 22 }}>
<span style={{ color: '#F0EDE8' }}>Barbar<span style={{ color: '#CC785C' }}>os

<div style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)' }}>Preparing your interview…

)
}

// ── Ended → Generating report (auto) ──
if (isEnded) {
return (
<div style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
<div style={{ fontWeight: 900, fontSize: 20, marginBottom: 28 }}>
<span style={{ color: '#F0EDE8' }}>Barbar<span style={{ color: '#CC785C' }}>os

{genError ? (
<>
<div style={{ fontSize: 13, color: '#F87171', marginBottom: 18, maxWidth: 360 }}>{genError}
<div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
<button type="button" onClick={goToReport}
style={{ padding: '12px 24px', background: '#CC785C', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
{L.retry}

<button type="button" onClick={() => { window.location.href = '/onboarding' }}
style={{ padding: '11px 24px', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'rgba(240,237,232,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
{L.newInterview}


</>
) : (
<>
<div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{L.complete}
<div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '8px 0 16px' }}>
{[0,1,2].map(i => (
<div key={i} className="bdot" style={{ animationDelay: ${i * 0.2}s }} />
))}

<div style={{ fontSize: 14, color: '#F0EDE8', fontWeight: 600, minHeight: 20, transition: 'opacity .3s' }}>{genSteps[genStep]}
<div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginTop: 6 }}>{L.generating}
</>
)}
{ .bdot { width: 9px; height: 9px; background: #CC785C; border-radius: 50%; animation: pulse 1.2s infinite; } @keyframes pulse { 0%,100% { opacity: .3; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.2) } } }

)
}

// ── Main Executive Interview Room ──
return (
<div
onClick={handleFirstInteraction}
style={{ fontFamily: 'system-ui, sans-serif', background: '#0B0D11', color: '#F0EDE8', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}
>
{/* ── Top bar ── */}
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', background: 'rgba(15,17,23,0.6)' }}>
<div style={{ flex: 1, minWidth: 0 }}>
<div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{CONFIG.jobTitle}
<div style={{ fontSize: 10, color: 'rgba(240,237,232,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{CONFIG.institution}


    <div style={{ textAlign: 'center', flexShrink: 0, padding: '0 12px' }}>
      <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.3 }}>
        <span style={{ color: '#F0EDE8' }}>BARBAR</span><span style={{ color: '#CC785C' }}>OS</span>
      </div>
      <div style={{ fontSize: 9, color: 'rgba(240,237,232,0.45)', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 1 }}>{L.sessionActive}</div>
    </div>

    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ fontWeight: 900, fontSize: 16, color: timeLeft < 60 ? '#F87171' : '#F0EDE8' }}>{formatTime(timeLeft)}</span>
      <button type="button" onClick={toggleMute}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: 'rgba(240,237,232,0.5)', display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: 'inherit' }}>
        {isMuted ? '🔇' : '🔊'} {isMuted ? L.audioMuted : L.audioOn}
      </button>
    </div>
  </div>

  {started && (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 18px 0' }}>
      <button type="button" onClick={() => setShowTranscript(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,237,232,0.4)', fontSize: 11, fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>
        {L.transcript}
      </button>
    </div>
  )}

  {/* ── Center: Barbaros presence ── */}
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: '20px 24px' }}>
    {!started ? (
      <>
        <div className="orb" style={{ boxShadow: `0 0 60px ${glow}55, inset 0 0 40px ${glow}22`, borderColor: `${glow}66` }}>
          <div style={{ fontWeight: 900, fontSize: 26 }}>
            <span style={{ color: '#F0EDE8' }}>B</span><span style={{ color: '#CC785C' }}>os</span>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{L.readyTitle}</div>
          <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.5)' }}>{CONFIG.candidateName} · {CONFIG.jobTitle}</div>
        </div>
        <button type="button" onClick={() => callAdam([])}
          style={{ padding: '13px 36px', background: '#CC785C', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 24px rgba(204,120,92,0.35)' }}>
          {L.begin}
        </button>
      </>
    ) : (
      <>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {animated && <div className="ring" style={{ borderColor: `${glow}55` }} />}
          {animated && <div className="ring ring2" style={{ borderColor: `${glow}33` }} />}
          <div className={animated ? 'orb breathe' : 'orb'} style={{ boxShadow: `0 0 70px ${glow}66, inset 0 0 44px ${glow}22`, borderColor: `${glow}77` }}>
            <div style={{ fontWeight: 900, fontSize: 28 }}>
              <span style={{ color: '#F0EDE8' }}>B</span><span style={{ color: '#CC785C' }}>os</span>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: glow === '#3A4252' ? 'rgba(240,237,232,0.65)' : glow, transition: 'color .3s' }}>{stateLabel}</div>
          <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', marginTop: 4 }}>{stateSub}</div>
        </div>

        {lastQuestion && (
          <div style={{ textAlign: 'center', maxWidth: 470, maxHeight: 170, overflowY: 'auto', fontSize: 17, lineHeight: 1.6, fontWeight: 500, color: '#F0EDE8', padding: '0 8px' }}>
            {lastQuestion}
          </div>
        )}

        {currentFocus && (
          <div style={{ textAlign: 'center', padding: '8px 16px', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(240,237,232,0.4)', marginBottom: 4 }}>{L.focusLabel}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8B96FF' }}>{currentFocus}</div>
          </div>
        )}
      </>
    )}
  </div>

  {/* ── Bottom controls ── */}
  {started && (
    <div style={{ padding: '14px 18px 22px', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
      {micError && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <button type="button" onClick={() => setShowTextInput(true)}
            style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#F87171', fontSize: 11.5, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
            ⌨ {L.micFail}
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
        <div />
        {/* Microphone (primary, centered) */}
        <button type="button" onClick={toggleRecording} disabled={isLoading || isTranscribing}
          style={{ justifySelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: (isLoading || isTranscribing) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          <div style={{
            width: 76, height: 76, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
            background: isRecording ? '#DC2626' : '#CC785C',
            boxShadow: isRecording ? '0 0 28px rgba(220,38,38,0.65)' : '0 6px 22px rgba(204,120,92,0.4)',
            transition: 'all .15s', opacity: (isLoading || isTranscribing) ? 0.4 : 1,
          }}>
            {isTranscribing ? '⏳' : isRecording ? '⏹' : '🎤'}
          </div>
          <span style={{ fontSize: 10, color: 'rgba(240,237,232,0.55)' }}>
            {isRecording ? (CONFIG.language === 'ar' ? 'إيقاف وإرسال' : 'Tap to send') : (CONFIG.language === 'ar' ? 'تحدّث' : 'Speak')}
          </span>
        </button>

        {/* End (right) */}
        <div style={{ justifySelf: 'end' }}>
          <button type="button" onClick={() => setShowEndModal(true)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.7)', fontFamily: 'inherit' }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', border: '0.5px solid rgba(248,113,113,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⛔</div>
            <span style={{ fontSize: 10 }}>{L.end}</span>
          </button>
        </div>
      </div>
    </div>
  )}

  {/* ── Transcript panel ── */}
  {showTranscript && (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,13,17,0.96)', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{L.transcriptTitle}</span>
        <button type="button" onClick={() => setShowTranscript(false)}
          style={{ background: 'none', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#F0EDE8', fontSize: 12, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
          ✕ {L.close}
        </button>
      </div>
      <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, i) => {
          const label = msg.score?.score !== undefined ? scoreLabel(msg.score.score) : null
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'assistant' ? 'flex-start' : 'flex-end', maxWidth: '88%', alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end' }}>
              <div style={{ background: msg.role === 'assistant' ? '#1a1f2e' : '#1E3A8A', borderRadius: 10, padding: '10px 13px', fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase', color: msg.role === 'assistant' ? '#8B96FF' : 'rgba(255,255,255,0.5)' }}>
                  {msg.role === 'assistant'
                    ? <><span style={{ color: '#F0EDE8' }}>Barbar</span><span style={{ color: '#CC785C' }}>os</span></>
                    : CONFIG.candidateName}
                </div>
                {msg.content}
                {label && (
                  <div style={{ marginTop: 6, padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, fontSize: 10, color: label.color, display: 'inline-block' }}>● {label.text}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )}

  {/* ── Text input panel (mic fallback) ── */}
  {showTextInput && (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#0F1117', borderTop: '0.5px solid rgba(255,255,255,0.1)', padding: '14px 16px', zIndex: 25, boxShadow: '0 -10px 30px rgba(0,0,0,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(240,237,232,0.5)' }}>{L.typeHere}</span>
        <button type="button" onClick={() => setShowTextInput(false)}
          style={{ background: 'none', border: 'none', color: 'rgba(240,237,232,0.5)', fontSize: 14, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
          placeholder={L.typeHere} disabled={isLoading} rows={1}
          style={{ flex: 1, background: '#16181F', border: '0.5px solid rgba(255,255,255,0.08)', color: '#F0EDE8', fontFamily: 'inherit', fontSize: 13, padding: '10px 12px', borderRadius: 8, outline: 'none', resize: 'none' }} />
        <button type="button" onClick={sendMessage} disabled={isLoading || !input.trim()}
          style={{ width: 46, background: (isLoading || !input.trim()) ? '#1a1a22' : '#2563EB', border: 'none', borderRadius: 8, cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 18, flexShrink: 0 }}>→</button>
      </div>
    </div>
  )}

  {/* ── End Interview modal ── */}
  {showEndModal && (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: 24 }}>
      <div style={{ background: '#12151C', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '26px 22px', maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{L.endTitle}</div>
        <div style={{ fontSize: 13, color: 'rgba(240,237,232,0.6)', lineHeight: 1.6, marginBottom: 22 }}>{L.endBody}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" onClick={() => { setShowEndModal(false); setIsEnded(true) }}
            style={{ padding: '12px 20px', background: '#CC785C', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {L.endGenerate}
          </button>
          <button type="button" onClick={() => setShowEndModal(false)}
            style={{ padding: '11px 20px', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'rgba(240,237,232,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {L.continueBtn}
          </button>
        </div>
      </div>
    </div>
  )}

  <style>{`
    .orb {
      width: 150px; height: 150px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(255,255,255,0.05), rgba(15,17,23,0.9));
      border: 1px solid; transition: box-shadow .4s, border-color .4s;
    }
    .breathe { animation: breathe 2.6s ease-in-out infinite; }
    .ring {
      position: absolute; width: 150px; height: 150px; border-radius: 50%;
      border: 1px solid; animation: ringPulse 2.2s ease-out infinite;
    }
    .ring2 { animation-delay: 1.1s; }
    @keyframes breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }
    @keyframes ringPulse {
      0%   { transform: scale(1);   opacity: .7 }
      100% { transform: scale(1.7); opacity: 0 }
    }
  `}</style>
</div>
)
}

export default function InterviewPage() {
return
}


Close
