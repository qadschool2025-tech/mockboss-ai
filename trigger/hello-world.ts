
import { task } from '@trigger.dev/sdk'

export const helloWorld = task({
  id: 'hello-world',
  run: async (payload: { name?: string }) => {
    return {
      message: `Hello, ${payload?.name ?? 'Barbaros'}!`,
    }
  },
})
