/* Original role-play dialogues using the textbook's nine situations and eighteen speaking goals. */
(() => {
  function d(lesson,type,title,goal,text) {
    const turns = text.split("\n").filter(Boolean).map(row=>{ const [speaker,jp,zh,en]=row.split("|"); return {speaker,jp,zh,en}; });
    const count=window.BUSINESS_DATA.dialogues.filter(x=>x.lesson===lesson).length;
    const chapter=window.BUSINESS_DATA.chapters[lesson-1];
    window.BUSINESS_DATA.dialogues.push({id:`dialogue-${lesson}-${count+1}`,kind:"dialogue",lesson,type,term:title,reading:"",zh:goal,en:chapter.en,category:type===0?"章节会话":type===1?"谈话练习 1":"谈话练习 2",turns,example:turns.map(x=>x.jp).join("\n"),sourcePage:chapter.page+(type===0?0:type===1?4:6),sourcePdf:chapter.pdf+(type===0?0:type===1?2:3),note:"按教材场景与谈话目标编写的原创会话。"});
  }
  d(1,0,"新人を歓迎する","欢迎新同事，了解对方的经验，用体谅的语气提出请求。",`課長|皆さん、今日は新しい仲間を歓迎しましょう。|各位，今天让我们欢迎新的伙伴。|Let's welcome our new colleague today.
先輩|佐藤さん、仕事にはもう慣れましたか。|佐藤，已经适应工作了吗？|Have you settled into your work, Sato?
新人|はい、おかげさまで。皆さんが助けてくださいますから。|是的，托大家的福。大家都在帮助我。|Yes, thanks to everyone. People have been very helpful.
先輩|それはよかったですね。困ったことがあったら、声をかけてください。|那太好了。有困难时，请告诉我。|I'm glad to hear that. Please let me know if you need help.
新人|ありがとうございます。明日の訪問に、一緒に行っていただきたいんですが。|谢谢。我希望您能陪同明天的拜访。|Thank you. I would like you to come with me on tomorrow's visit.
先輩|もちろんです。入社して以来、このお客様を担当していますから。|当然。从入职以来，我一直负责这位客户。|Of course. I've worked with this client ever since joining the company.
課長|やる気さえあれば大丈夫です。期待していますよ。|只要有干劲就没问题。期待你的表现。|With motivation, you'll do well. We're looking forward to your contribution.
新人|はい。少しずつ経験を積んでいきたいです。|好的。我希望逐渐积累经验。|Yes. I'd like to build up my experience step by step.`);
  d(1,1,"気遣って声をかける","先问近况，再表达支持，不替对方做决定。",`先輩|最近、仕事はどうですか。|最近工作怎么样？|How is work going lately?
新人|少し忙しいですが、皆さんに助けていただいています。|稍微忙些，但大家都在帮助我。|It's a little busy, but everyone has been helping me.
先輩|困ったことがあったら、いつでも相談してください。|遇到困难时，随时来找我商量。|Please talk to me whenever you need help.
新人|ありがとうございます。とても心強いです。|谢谢。我感到很安心。|Thank you. That's very reassuring.`);
  d(1,2,"相手を知る","通过开放式问题了解经验与兴趣。",`先輩|以前は、どのようなお仕事をされていたんですか。|您之前从事怎样的工作？|What kind of work did you do before?
新人|メーカーで、海外のお客様を担当していました。|我在制造企业负责海外客户。|I worked with overseas clients at a manufacturer.
先輩|そうですか。お休みの日は、何をなさっていますか。|这样啊。休息日您会做什么？|I see. What do you do on your days off?
新人|散歩をしたり、猫と遊んだりしています。|我会散步，或和猫一起玩。|I go for walks and play with my cat.`);
  d(2,0,"仕事の引き継ぎをする","说明背景、逐项交代注意事项，最后确认责任。",`先輩|今、少しよろしいですか。引き継ぎをしたいんですが。|现在方便吗？我想交接一下工作。|Do you have a moment? I'd like to hand over the work.
後任|はい。お願いいたします。|好的，麻烦您了。|Yes, please go ahead.
先輩|担当するにあたって、まず訪問時間を確認してください。|负责这项工作时，首先请确认拜访时间。|Before taking responsibility, please check the visiting times.
後任|承知しました。ほかに、気をつけることはありますか。|明白了。还有其他注意事项吗？|Understood. Is there anything else I should be careful about?
先輩|重要なお客様に限らず、すべての記録を毎日確認するべきです。|不仅重要客户，所有记录都应该每天确认。|You should check all records daily, not just those for major clients.
後任|慎重に確認するに越したことはありませんね。|最好谨慎确认，对吧。|It's best to check them carefully, isn't it?
先輩|そうですね。業界については、総務の方もよくご存じです。|是的。总务的同事也很了解这个行业。|That's right. Our general affairs colleagues also know the industry well.
後任|引き受けた以上、責任を持って対応いたします。|既然接下了，我会负责任地处理。|Now that I've taken it on, I will handle it responsibly.`);
  d(2,1,"指示する","按「まず・次に・それから」说明具体动作。",`上司|展示会に参加するにあたって、三つ確認してください。|参加展览会时，请确认三件事。|Please check three things before attending the exhibition.
担当者|はい。何でしょうか。|好的，是什么呢？|Yes. What are they?
上司|まず資料をそろえてください。次に名刺を準備してください。それから、会場を確認してください。|首先准备资料，其次准备名片，然后确认场地。|First prepare the materials, then your business cards, and finally check the venue.
担当者|承知しました。本日中に確認いたします。|明白了。我今天之内会确认。|Understood. I'll check everything today.`);
  d(2,2,"アドバイスをする","先确认问题，再给出理由和建议。",`後任|お客様への説明が、うまくできなくて困っています。|我无法很好地向客户说明，感到很困扰。|I'm having trouble explaining things to clients.
先輩|まず、結論からお話ししたらどうでしょうか。|先从结论说起，您觉得怎么样？|How about starting with your conclusion?
後任|結論からですね。|先说结论，是吧。|Start with the conclusion, right?
先輩|はい。その後で理由を説明すると、伝わりやすいと思います。|是的。之后再说明理由，我觉得会更易理解。|Yes. If you explain the reasons afterward, it should be easier to follow.`);
  d(3,0,"取引先を訪問する","拜访寒暄、确认需求、说明可提供的支持、带回讨论。",`担当者|本日は、お忙しいところお時間をいただき、ありがとうございます。|感谢您今天在百忙之中安排时间。|Thank you for making time for us today.
取引先|こちらこそ、遠いところありがとうございます。|我们才要感谢您远道而来。|Thank you for coming all this way.
担当者|新しい商品の海外販売について、ご相談に伺いました。|我来与您商量新商品的海外销售。|I've come to discuss overseas sales of the new product.
取引先|品質といい、価格といい、自信はあるものの、方法が分からなくて。|无论品质还是价格，我们都有信心，但不知道该如何做。|We're confident in the quality and price, but unsure how to proceed.
担当者|国内はもちろん、海外の販売支援も行っております。|我们不仅支持国内销售，也支持海外销售。|We support overseas sales as well as domestic sales.
取引先|それは心強い限りですね。|那真是十分令人安心。|That is very reassuring.
担当者|社内で確認した上で、改めてご提案いたします。|在公司内部确认之后，我会再次提案。|I'll make a further proposal after checking internally.
取引先|よろしくお願いいたします。|那就拜托您了。|Thank you. We look forward to your proposal.`);
  d(3,1,"訪問のあいさつをする","自报姓名、确认预约、感谢接待。",`訪問者|お世話になっております。青空商事の佐藤と申します。|承蒙关照。我是青空商事的佐藤。|Hello. I'm Sato from Aozora Trading.
受付|いらっしゃいませ。ご予約はございますか。|欢迎。请问您有预约吗？|Welcome. Do you have an appointment?
訪問者|はい。二時に、営業部の田中様とお約束しております。|是的，我与销售部的田中先生约了两点。|Yes. I have a two o'clock appointment with Mr. Tanaka in Sales.
受付|かしこまりました。少々お待ちください。|明白了。请稍等。|Certainly. Please wait a moment.`);
  d(3,2,"話を切り上げて終わりのあいさつをする","概括下一步，表达感谢后自然结束。",`訪問者|それでは、本日のお話を社内で確認いたします。|那么，我会在公司内部确认今天讨论的内容。|I'll review today's discussion with our team.
取引先|ありがとうございます。お返事をお待ちしております。|谢谢。期待您的回复。|Thank you. We'll wait for your response.
訪問者|本日はお時間をいただき、ありがとうございました。では、失礼いたします。|感谢您今天安排时间。那么，告辞了。|Thank you for your time today. I'll be leaving now.
取引先|こちらこそ、ありがとうございました。|我们才要感谢您。|Thank you as well.`);
  d(4,0,"営業報告会に出る","说明依据、区分结果与提案、回应提问。",`上司|では、営業報告をお願いします。|那么，请做销售报告。|Please give us the sales report.
担当者|お手元の資料をご覧ください。新商品の販売に関して、ご報告します。|请看手边的资料。我来报告新商品销售情况。|Please look at the materials. I'll report on the new product's sales.
担当者|営業部を中心に、三つの店舗で試験販売を行いました。|我们以销售部为中心，在三家店铺开展了试销。|Led by Sales, we ran a trial in three stores.
上司|結果はどうでしたか。|结果怎么样？|What were the results?
担当者|確認したところ、年齢を問わず、好評でした。|确认后发现，不同年龄层都评价很好。|We found it was well received across age groups.
同僚|初めての試みとしては、よい結果ですね。|作为首次尝试，这是好结果。|That's a good result for a first attempt.
担当者|ただ、現地を見ないことには、次の判断はできません。|不过，不看现场就无法做下一步判断。|However, we cannot decide on the next step without visiting the site.
上司|分かりました。現地視察の計画をまとめてください。|明白了。请整理实地考察计划。|Understood. Please prepare a site-visit plan.`);
  d(4,1,"ミーティングで説明する","结论先行，再给依据和具体安排。",`担当者|来月から試験販売を始めることを提案します。|我提议从下个月开始试销。|I propose starting a sales trial next month.
上司|その理由を説明してください。|请说明理由。|Please explain why.
担当者|お客様の反応を確認したいからです。まず一店舗で実施します。|因为想确认客户反应。先在一家店实施。|We want to test customer responses. We'll begin with one store.
上司|分かりました。費用も確認しておいてください。|明白了。也请先确认费用。|Understood. Please check the costs as well.`);
  d(4,2,"自分の意見を通す","先承认对方顾虑，再说明提案的益处。",`上司|この案は、費用が少し高いですね。|这个方案费用有些高。|This proposal is a little expensive.
担当者|確かに、初期費用は高いと思います。|确实，我也认为初始费用较高。|I agree that the initial cost is high.
担当者|ただ、長期的には作業時間を減らせます。小規模に試してみてはいかがでしょうか。|不过，从长期看能减少作业时间。要不要先小规模尝试？|However, it can save time in the long term. Could we try it on a small scale?
上司|そうですね。まず試験的に進めましょう。|也是。先试验性地推进吧。|That sounds reasonable. Let's start with a trial.`);
  d(5,0,"職場の人とランチに行く","自然地评价、邀请，并给对方拒绝空间。",`同僚|お昼、一緒に食べに行きませんか。|午饭要不要一起出去吃？|Would you like to go out for lunch?
担当者|いいですね。近くにおすすめの店はありますか。|好啊。附近有推荐的店吗？|Sounds good. Is there a place nearby you'd recommend?
同僚|新しくできた店があります。評判の店だけあって、おいしいですよ。|有一家新开的店。不愧是口碑好的店，味道不错。|There's a new place. The food lives up to its reputation.
担当者|全部のメニューを食べたんですか。|您吃过所有菜品了吗？|Have you tried everything on the menu?
同僚|全部というわけじゃないけれど、魚料理ならではの味が楽しめます。|并不是全部都吃过，但能品尝到鱼料理特有的风味。|Not everything, but their fish dishes have a distinctive flavor.
担当者|それは楽しみです。|那真值得期待。|I'm looking forward to it.
同僚|明日もどうですか。|明天也去怎么样？|How about going tomorrow too?
担当者|お誘いありがとうございます。明日は予定があるので、またの機会にお願いします。|谢谢邀请。明天有安排，下次再一起吧。|Thank you for inviting me. I have plans tomorrow, so perhaps another time.`);
  d(5,1,"評価する","举出具体依据，评价能力或成果。",`同僚|田中さんの発表、どうでしたか。|田中的报告怎么样？|How was Tanaka's presentation?
担当者|分かりやすかったですね。資料の整理にかけては、本当に上手です。|很容易理解。论资料整理，确实很擅长。|It was clear. Tanaka is particularly good at organizing information.
同僚|そうですね。例も具体的でした。|是的，例子也很具体。|Yes. The examples were specific too.
担当者|説明といい、資料といい、とてもよかったと思います。|无论说明还是资料，我都觉得很好。|Both the explanation and the materials were excellent.`);
  d(5,2,"誘いを断る","感谢邀请、简要说明原因，表达下次意愿。",`同僚|今晩、食事に行きませんか。|今晚要不要去吃饭？|Would you like to have dinner tonight?
担当者|お誘いありがとうございます。今日は、ちょっと予定がありまして。|谢谢邀请。今天已经有些安排。|Thank you for inviting me. I have plans today.
同僚|そうですか。また今度お願いします。|这样啊。那下次吧。|I see. Maybe another time.
担当者|はい。またの機会に、ぜひご一緒させてください。|好的。下次请一定让我一起参加。|Yes. I'd love to join you another time.`);
  d(6,0,"家族と休みの計画を立てる","区分与家人交流的口语和对外正式表达。",`家族|次の休み、どこかに行かない。|下次休假，要不要去哪里玩？|Shall we go somewhere on our next break?
自分|いいね。でも、一週間も休めっこないよ。|好啊。但不可能休假一周吧。|Sounds good, but there's no way I can take a whole week off.
家族|じゃあ、二泊ぐらいにしよう。温泉にしても海にしても、ゆっくりできるよ。|那就住两晚吧。不论温泉还是海边，都能休息。|Then let's stay two nights. We can relax either at a hot spring or by the sea.
自分|温泉は、去年行ったきりだね。|温泉自从去年去过后，就没再去了。|We haven't been to a hot spring since last year.
家族|最近忙しかったから、休みが必要に決まってるよ。|最近一直很忙，当然需要休息。|You've been busy, so of course you need a break.
自分|そうだね。結果の発表が気になって、落ち着かなくてたまらないんだ。|是啊。我在意结果公布，特别不安。|Yes. I'm so anxious about the results that I can't relax.
家族|今は心配しても仕方ないよ。少し休もう。|现在担心也没有办法。稍微休息一下吧。|Worrying won't help now. Let's take a break.
自分|ありがとう。明日、予定を確認するね。|谢谢。我明天确认安排。|Thanks. I'll check my schedule tomorrow.`);
  d(6,1,"親しい人を説得する","结合对方需求，给出可以接受的替代方案。",`家族|遠くまで行くのは、疲れるから嫌だな。|去很远的地方太累，我不太想去。|I don't want to travel far. It's tiring.
自分|じゃあ、近くの温泉はどう。電車で一時間だよ。|那附近的温泉怎么样？电车只要一小时。|How about a nearby hot spring? It's only an hour by train.
家族|それなら、ゆっくりできそうだね。|这样应该能好好休息。|That sounds relaxing.
自分|うん。無理のない計画にしよう。|嗯。制定一个不勉强的计划吧。|Let's make a plan that isn't too demanding.`);
  d(6,2,"親しい人を慰める","先接受感受，再表达支持，不一味下保证。",`友人|面接でうまく話せなくて、落ち込んでるんだ。|面试时没说好，我很沮丧。|I didn't speak well at the interview, and I feel down.
自分|それはつらかったね。|那一定很难受吧。|That must have been hard.
自分|でも、準備したことは無駄にならないよ。次は一緒に練習しよう。|不过，准备不会白费。下次我们一起练习吧。|Your preparation wasn't wasted. Let's practice together next time.
友人|ありがとう。少し気持ちが楽になったよ。|谢谢。我稍微轻松些了。|Thank you. I feel a little better.`);
  d(7,0,"会う約束をする","问时间、说明来意、给备选、复述确认。",`紹介担当|お世話になっております。今、少しお時間よろしいでしょうか。|承蒙关照。现在有一点时间吗？|Hello. Do you have a moment?
候補者|はい。どうぞ。|有的，请说。|Yes, go ahead.
紹介担当|ご希望通りの求人がありまして、詳細をご説明したいと思います。|有一条符合您希望的招聘信息，我想说明详情。|We have a position that matches your preferences, and I'd like to explain the details.
候補者|ありがとうございます。今週は会議やら出張やらで忙しいものですから。|谢谢。本周又是会议又是出差，很忙。|Thank you. I'm busy with meetings and business trips this week.
紹介担当|来週の火曜日はいかがでしょうか。|下周二怎么样？|How about next Tuesday?
候補者|午後三時でしたら、時間を作れます。|下午三点的话，我能安排出时间。|I can make time at three in the afternoon.
紹介担当|承知しました。では、火曜日の午後三時に弊社でお待ちしております。|明白了。那么，周二下午三点在敝公司等您。|Understood. We'll see you at our office on Tuesday at three.
候補者|火曜日の三時ですね。よろしくお願いいたします。|周二三点是吧。麻烦您了。|Tuesday at three, correct. Thank you.`);
  d(7,1,"相手を説得する","说明益处、体谅顾虑，再提出具体行动。",`担当者|新しい案について、一度ご検討いただけませんか。|能请您考虑一下新方案吗？|Could you consider our new proposal?
相手|今は、あまり時間が取れないんですが。|现在不太能安排时间。|I don't have much time right now.
担当者|承知しました。要点を一枚にまとめますので、十分ほどお時間をいただければと思います。|明白了。我会把要点整理成一页，希望能安排十分钟左右。|Understood. I'll summarize it on one page, so we'd appreciate about ten minutes.
相手|それでしたら、明日確認しましょう。|这样的话，明天确认吧。|In that case, let's review it tomorrow.`);
  d(7,2,"日時を調整する","提两个明确时间，并复述最终安排。",`担当者|来週のご都合はいかがでしょうか。|您下周是否方便？|What is your availability next week?
相手|火曜日の午前、または水曜日の午後でしたら空いています。|周二上午或者周三下午有空。|I'm free on Tuesday morning or Wednesday afternoon.
担当者|では、水曜日の午後二時はいかがでしょうか。|那么，周三下午两点怎么样？|Would Wednesday at two work for you?
相手|はい。水曜日の午後二時ですね。承知しました。|好的，周三下午两点是吧。明白了。|Yes. Wednesday at two. Understood.`);
  d(8,0,"人材紹介会社の人と面談をする","确认岗位、条件和入职日期，留出考虑时间。",`紹介担当|本日はお越しいただき、ありがとうございます。どうぞおかけください。|感谢您今天前来。请坐。|Thank you for coming today. Please have a seat.
候補者|ありがとうございます。では、失礼いたします。|谢谢，那我就坐下了。|Thank you. I'll take a seat.
紹介担当|こちらは、海外事業をはじめとした企画業務を行う会社です。|这是一家从事包括海外业务在内的企划工作的公司。|This company works on planning projects, including overseas business.
候補者|資料を拝見します。業務内容のみならず、研修制度にも関心があります。|我看一下资料。我不但关心工作内容，也关心培训制度。|I'll look at the materials. I'm interested in training as well as the duties.
紹介担当|事業の拡大に伴って、研修も充実させています。|随着业务扩大，公司也在充实培训。|They are improving training as the business grows.
候補者|もし入社するとしたら、いつから働くことになりますか。|假如入职，会从什么时候开始工作？|If I joined, when would I start?
紹介担当|来月以降ですが、調整は可能です。|下个月起，但日期可以协调。|From next month, but the date can be adjusted.
候補者|家族と相談したいので、結論が出次第、お返事いたします。|我想与家人商量，一有结论就会回复。|I'd like to consult my family and will reply as soon as I've decided.`);
  d(8,1,"会社について尋ねる","先请求提问许可，再具体询问工作信息。",`候補者|一つ伺ってもよろしいでしょうか。|可以请教一个问题吗？|May I ask a question?
紹介担当|はい、どうぞ。|可以，请说。|Of course. Go ahead.
候補者|入社後の研修制度について、詳しく教えていただけますか。|能请您详细说明入职后的培训制度吗？|Could you explain the training available after joining?
紹介担当|最初の一か月は、先輩と一緒に業務を学びます。|第一个月，会与前辈一起学习业务。|During the first month, you'll learn the work alongside a senior colleague.`);
  d(8,2,"返事を保留する","说明需考虑，给出回复期限，兑现承诺。",`紹介担当|この条件で、進めてもよろしいでしょうか。|可以按这个条件继续推进吗？|May we proceed with these conditions?
候補者|前向きに検討しておりますが、家族とも相談したいと思っています。|我正在积极考虑，但也想与家人商量。|I'm considering it positively, but I'd like to consult my family.
候補者|金曜日まで、お時間をいただけますでしょうか。|能请您给我时间到周五吗？|Could I have until Friday?
紹介担当|承知しました。では、お返事をお待ちしております。|明白了。那么，期待您的回复。|Understood. We'll wait for your reply.`);
  d(9,0,"面接を受ける","礼貌进入、连接经验与应聘动机、提问并致谢。",`応募者|失礼いたします。佐藤と申します。本日はよろしくお願いいたします。|打扰了。我叫佐藤。今天请多关照。|Excuse me. My name is Sato. Thank you for seeing me today.
面接官|どうぞおかけください。志望理由をお聞かせください。|请坐。请告诉我您的应聘动机。|Please have a seat and tell us why you applied.
応募者|私は五年間にわたって、海外のお客様を担当してきました。|五年来，我一直负责海外客户。|I've worked with overseas clients for five years.
応募者|その経験を通じて、課題を整理し、関係者と調整する力を身につけました。|通过这段经历，我掌握了整理问题和协调相关人员的能力。|That experience taught me to organize issues and coordinate with stakeholders.
応募者|御社の海外向けの事業で、この強みを発揮したいと考え、応募いたしました。|我希望在贵公司面向海外的业务中发挥这项优势，因此应聘。|I applied because I'd like to use this strength in your overseas business.
面接官|今後は、国内の案件を担当する可能性もありますが、いかがですか。|今后也可能负责国内项目，您觉得怎样？|You may also handle domestic projects. How would you feel about that?
応募者|はい。どのような業務でも、責任を持って取り組みます。|可以。无论哪种工作，我都会负责地投入。|I would approach any assignment responsibly.
面接官|ありがとうございます。最後に、ご質問はありますか。|谢谢。最后您有问题吗？|Thank you. Do you have any questions for us?`);
  d(9,1,"面接時の入室・質問・退出","礼貌进入、征求提问许可、致谢离开。",`応募者|失礼いたします。佐藤と申します。|打扰了。我叫佐藤。|Excuse me. My name is Sato.
面接官|どうぞおかけください。|请坐。|Please have a seat.
応募者|ありがとうございます。一つ伺ってもよろしいでしょうか。|谢谢。可以请教一个问题吗？|Thank you. May I ask a question?
応募者|本日はお時間をいただき、ありがとうございました。失礼いたします。|感谢您今天安排时间。那么，告辞了。|Thank you for your time today. I'll be leaving now.`);
  d(9,2,"志望理由について話す","用「经验 → 能力 → 公司业务 → 贡献」说明动机。",`面接官|当社を志望した理由をお聞かせください。|请告诉我您选择本公司的理由。|Please tell us why you applied to our company.
応募者|海外での業務を通じて、お客様の要望を整理する力を身につけました。|通过海外业务，我掌握了整理客户需求的能力。|My overseas work taught me to understand and organize client needs.
応募者|御社の新しいサービスでは、その経験を活かせると考えております。|我认为在贵公司的新服务中，能发挥这段经验。|I believe I can use that experience in your new services.
応募者|お客様の課題解決に貢献したいと思い、応募いたしました。|希望为解决客户问题作出贡献，因此我应聘了。|I applied because I'd like to help solve your clients' problems.`);
})();
