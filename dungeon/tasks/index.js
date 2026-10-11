// Clue kind → task class. Task contract (every file here):
//   export default class XTask { constructor(room, clue)  async run()  destroy() }
//   run(): draws its scene via room.stage.drawScene(clue.scene), asks (room.ui.prompt(clue.ask.zh, clue.ask.en)),
//          loops until checkAnswer(clue, picked) is true: on wrong, step = await room.wrong(picked);
//          step 2 → glow the reference object(s); step 3 → animate the answer, then resolve. On right: await room.right().
import ChooseTask from './choose.js?v=202610112341';
import GoTask from './go.js?v=202610112341';
import PlaceTask from './place.js?v=202610112341';
import JudgeTask from './judge.js?v=202610112341';
import SelectTask from './select.js?v=202610112341';
import PickTask from './pick.js?v=202610112341';
import MakeTask from './make.js?v=202610112341';
import SolveTask from './solve.js?v=202610112341';

export const TASKS = { choose: ChooseTask, go: GoTask, place: PlaceTask, judge: JudgeTask, select: SelectTask, pick: PickTask, make: MakeTask, solve: SolveTask };
