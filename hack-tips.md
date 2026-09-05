How to find hackathon winning ideas
I have participated in 35+ hackathons now and won 15, including some of the biggest names like @AnthropicAI, @GoogleDeepMind, @SarvamAI and @ETHIndiaco 
Finding an idea still remains the hardest part, especially since building has become easier than ever.
Not claiming that we are perfect. We still fret before participating in a new one. However, I am going to share our process with lots of examples (including the ones that didn't win), with an aim to hopefully give you more ideas on how to pick an idea :)
PS: this can help you find ideas even otherwise and I am no way advocating that you should participate just for winning.
Let's start:
1. Don't ask AI
yup, I said don’t.
Contrary to the usual first step, don’t ask your favourite ai assistant for ideas. The reason is that everyone else would also be doing the same. You will get the same generic results - nothing that stands out.
but it is a good proxy to find what not to build  because everyone else would.
That said, do use it to further expand your idea or ask deliberate questions in order to evaluate its feasibility.
2. Subconsciously gather inspiration
I think this is one of the most important aspects and its a little difficult to explain.
But essentially, treat X / Reddit as a space to find interesting ideas, before they become mainstream. Tune your feed over time so that it shows you new interesting ideas, product launches and demos early.
And no - I am not asking you to copy them. Just see them, appreciate and bookmark them, not necessarily with the lens of building it. It doesn't have to be a specific field either - can be a mix of design, tech, art etc. 
Over time, you will develop a natural muscle to spot good ideas and then build something tangential. It can be a mix of a very recent idea and an idea that has been forgotten. A mix of what was not possible with a nostalgic twist.
You need not over think and stress about the current problem at hand. You would develop a way to link these, subconsciously. 
Example:
Back in April, there was an insanely cool concept of a Flipbook created by @zan2434 

Zain Shah
@zan2434
Imagine every pixel on your screen, streamed live directly from a model. No HTML, no layout engine, no code. Just exactly what you want to see.

@eddiejiao_obj
, 
@drewocarr
 and I built a prototype to see how this could actually work, and set out to make it real. We're calling it Flipbook. (1/5)
9:30 PM · Apr 22, 2026
·
6M
 Views
Relevant
View quotes

Zain Shah
@zan2434
·
Apr 22
Because there's no strict layout engine, illustrations reshape themselves to fit your window. And any region of the image can become interactive, not just the parts someone decided to make a button (2/5)

Zain Shah
@zan2434
·
Apr 22
To bring the imagery to life, we heavily optimized @LTXStudio's video model. Enough to stream live 1080p video at 24fps directly to your screen, connecting directly via websockets to 
@modal_labs
 serverless GPU infra. (3/5)
Zain Shah
@zan2434
·
Apr 22
Today, Flipbook is limited, so we designed it around visual explanations. As the models get more accurate and more stateful, the set of things worth doing this way will expand. Even ones you'd assume need structured UIs like coding: (4/5)
0:00 / 0:21
Zain Shah
@zan2434
·
Apr 22
All of this is live! it's early and slow. many of the demos above are sped up/edited, but we can't wait to see what you think. Try it yourself at http://flipbook.page (5/5)

In early August, @nuwandavek created a simcity inspired version of the SF map called sf.isopolis.city (you should check out his really cool blog btw on how he made it)


Vivek Aithal
@nuwandavek
new weekend sideproject: http://isopolis.city 
this is SF simcity meets ghibli during the opening credits of silicon valley. explore SF and take the tours! 

made with my ragtag team of coding agents. welcome to the golden era of side projects!
5:39 AM · Aug 3, 2026
·
31.3K
 Views
Relevant
View quotes

Vivek Aithal
@nuwandavek
·
Aug 3
when i saw 
@_coenen
 's NYC project, i was immediately reminded of the opening credits of SV tv show. this project was insanely fun and insanely complicated and would have probably been abandoned midway without codex and claudecode.
3d tiles from 
@googlemaps
, base model from 
@Alibaba_Qwen
 finetuned on 
@modal
.
Taking inspiration from these two ideas, we created Claude City for @AnthropicAI x @ElevCap's Push To Prod Hackathon. Claude City turns your codebase and GitHub PRs into a live isometric city where AI agents visibly build and review your software in real time. 


Post

See new posts
Conversation
Parth
@mittalparth_
placed 2nd, winning $3000 at 
@AnthropicAI
 x 
@ElevCap
 push to prod hackathon! ⚡️

> we built claude code but as a game
> your entire repo becomes an isometric city
> files are buildings with the height determined by the number of files
> choose your crew for a task aka your model
> visualise agents constructing buildings (files) in realtime
> open PRs are ships. navigate to a new island to visualise PRs and review the changes
> built using the 
@claudeai
 sdk
> software engineering is shifting towards managing multiple agents rather than reading file diffs. we don't want you to scroll reels while your agents do work.

shoutout to team 
@devfolio
 as always for the best hackathons.

big shoutout to the team 
@ahmedfahim21_
 
@ArjunVegeta
 ♥️
 If you'd notice, the inspirations are from very different timelines but the final idea clicked subconsciously. Models had become good enough to be able to do it within 4 hours. And for the theme, @claudeai was at the heart of the project - which brings me to the next point
3. The organiser tech has to be the hero
You need to remember that hackathons are organised by companies so that they can see their new shiny piece of tech - shine the brightest. 
You could make the best product or create the best engineering architecture. But if sponsors' products are not the heart and soul of your project, you are likely to fail. 
Ask yourself this question: Could I build my project without this?
If the answer, is a yes, then you are building the wrong thing. A project that is simple but pushes the limit of the technology or showcases something completely different has a higher chance of winning.
Example:
Kahani: Built at the @GoogleDeepMind hackathon, the idea was to push the limits of the new @NanoBanana model which is fast and cheap. Building a game came to mind as they are a good representation of pushing creative limits. It formed the heart of the project as all assets were generated and the UI/UX of the game heavily relied on the mode's quality and speed.

placed 1st, winning $5000 at the 
@GoogleDeepMind
 x 
@cerebral_valley
 hackathon bangalore! 😭

> we built an RPG game generator that uses 
@NanoBanana
 to create worlds and assets as you play and progress
> you can create your own worlds that are rooted in Indian culture
> every asset that you see is generated on the fly
> the gameplay assets, dialogues, and clues all change with the theme
> for instance, the first visual in the video is from the movie lagaan!

insane clutch at the last moment
At the same time, it needs to come with a balance. If you try to force the tech or try to combine multiple sponsors to increase your odds, without meaningfully adding value to your project - it can also be a red flag. 
Simple is beautiful.
4. It needs to be demo-able
By the nature of hackathons, you do not have all the time to explain your revolutionary idea among hundreds of projects and demos. At best, you have 3 minutes. Since the judges are already overwhelmed, assume that you only have a minute.
Your idea should catch attention while being simple enough to explain in 1 line. If explaining your problem itself takes over 30 seconds, then drop it. If your solution does not have a good use case that is visible enough, drop it. The project needs to be showcase worthy.
Examples:
Not so good ones
Aaroh: we built a solution for agentic commerce where agents find merchants via Google's UCP, shop, pay with using x402, and carry a trustless identity.
I know its already a mouthful. Explaining the problem itself was time consuming here. Actual demo came later

Fahim
@ahmedfahim21_
·
Apr 8
Spent the last few weeks building Aaroh for 
@PL__Genesis
 hackathon with 
@mittalparth_
 

Our bet: AI agents will shop for us before we know it

Aaroh makes that real today, agents that find merchants (UCP), shop, pay with crypto (x402), and carry a trustless identity (ERC-8004)
0:02 / 3:03
Medha: we tried building a proactive Siri. I don't necessarily call this is a bad idea. It is at the edge. But at the same time, its hard to demo. How do I show you something proactive, in a few seconds? You have to experience it yourself, over time.
Good ones
The 2 I already spoke about above
ComicifyAI: text to comics - back in 2023 when image models weren't as good, especially with text. Simple, easy to showcase while still being at the slight edge.
5. Be early
Each project changes with the current technical progress, what has already been done and what is being looked for. That is why being early is important. 
Something that was a limitation a month ago, would have become mainstream. This also relates to the 2nd point we discussed: developing a muscle over time to spot the right ideas and spot them early - before much of the world has understood that.
Example:
When gearing up for the @SarvamAI hackathon, @mattshumer_'s Claude of Duty had just caught up on X.
Matt Shumer
@mattshumer_
·
Jul 25
Claude Opus 5 one-shotted this game.

EVERYTHING you see in this demo is custom code... not a single external asset was used.

AI games are going to be amazing.

(sound on)
0:03 / 0:56
That is when we thought, how about building a similar game, set in the Indian context but tailored more towards utilising the Sarvam stack.
That led to building a voice-first 3D game where users could learn new Indic languages through everyday conversations. (you can check what we built here, X doesn't allow me to showcase it here somehow)
If you'd notice, the final outcome does not look like Matt's game. We did attempt something similar as @marcdhi outlines here:


Mardav
@marcdhi
·
Jul 28
here's what we tried to cook at the 
@SarvamAI
 x 
@GrowthX_Club
 hackathon, built with Opus 5

- before the version 
@mittalparth_
 showed, we started building an open world GTA styled Bengaluru you could actually walk around in

- the idea was that you'd roam the city, walk up to a flower stall or an auto, and the conversation practice would just happen there, in place, instead of in a menu

- hugely inspired by 
@mattshumer_
 s Claude of Duty 🫡🫡

- the part I'm most happy about, every single asset you see here is generated in JavaScript. Vidhana Soudha, the auto rickshaw, the coconut trees, flower stalls, tarpaulins, the mess of street wires overhead, the market carts, nothing downloaded, nothing modelled in Blender, no heavy 3D assets anywhere at all!!!

and yes the auto looks a little rough xD

- it was eating way too much of our time though, so we made the call to ship the lighter, actually finished version instead. Maybe the right call for a hackathon, still a little sad about it 🥲

happy to keep building this out if people want to see where it goes :)

@SarvamForDevs
 
@VinayakGavariya
 

btw we’re live, try it out here:
http://playsadak.vercel.app

Post

See new posts
Conversation
Parth
@mittalparth_
here's what we built at the 
@SarvamAI
 x 
@GrowthX_Club
 hackathon!

> an interactive, voice-first game where you learn new languages through everyday conversations
> our insight was that not everyone needs to master a language - they only need a few sentences, useful in everyday situations
> you can choose your region (like Bengaluru), and the level of difficulty according to which your interactions are based
> it then guides you on what to say in a given situation, like booking an auto
> it grades on you how well you spoke, what you missed, progressively getting difficult with more levels

didn't make it to the top 15, but hey we had fun :)

@SarvamForDevs
's TTS-STT stack is definitely some of the best in the world currently.

However, due to lack of time we adapted to a simpler gameplay while making sure that the Sarvam stack remained at the heart. The gameplay was not the most critical thing here since showcasing the STT-TTS stack was more important.
6. Utilise your domain knowledge
