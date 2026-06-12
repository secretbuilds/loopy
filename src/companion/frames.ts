export type Mood = "sleepy" | "idle" | "perky" | "attentive" | "celebrate";

export const FRAMES: Record<Mood, string[]> = {
  idle: [
`   ╭──╮
  ╭│◕ ◕│╮
   ╰◡◡╯`,
`   ╭──╮
  ╭│◕ ◕│╮
   ╰◡◡╯ `,
`   ╭──╮
  ╭│− −│╮
   ╰◡◡╯`,
  ],
  sleepy: [
`   ╭──╮
  ╭│− −│╮  z
   ╰‿‿╯`,
`   ╭──╮
  ╭│− −│╮  z Z
   ╰‿‿╯`,
  ],
  perky: [
`   ╭──╮ ✧
  ╭│◕ ◕│╮
   ╰◡◡╯`,
`  ✧╭──╮
  ╭│✧ ✧│╮
   ╰◡◡╯ ✧`,
  ],
  attentive: [
`   ╭──╮
  ╭│◕ ◕│╮
   ╰──╯`,
  ],
  celebrate: [
`  ✧ ╭──╮ ✧
  ╭│✧◡✧│╮
   ╰─◡─╯`,
` ✧  ╭──╮  ✧
  ╰╰│✧◡✧│╯╯
    ╰◡╯`,
  ],
};
