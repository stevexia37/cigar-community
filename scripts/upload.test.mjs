/**
 * 图片选择辅助函数的单元测试。
 *
 * 重点覆盖一个**曾经真实发生**的 bug：`input.files` 是活的 FileList，
 * 被 `input.value = ''` 清空后，任何「先 await 再读取」的消费者都会拿到空列表。
 * 表现是选图毫无反应、且控制台无任何报错 —— 在浏览器里极难定位，
 * 所以在这里用「模拟活 FileList」的方式把它钉死。
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { toFileArray, pickImageFiles } from '../web/src/composables/imageFiles.js'

/**
 * 构造一个「活的」类 FileList：它的 length 与元素**直接读自源数组**。
 *
 * 必须这样写才能真实模拟浏览器的 FileList —— 一旦有人执行 `input.value = ''`，
 * 真 FileList 会就地变空。如果这里把 length 存成快照值，测试就永远发现不了
 * 「先 await 后读取」的 bug（我第一版就是这么写的，断言反而失败）。
 */
function fakeFileList(files) {
  return {
    get length() { return files.length },
    item: (i) => files[i] ?? null,
    [Symbol.iterator]: function* () { for (const f of files) yield f },
    ...Object.fromEntries(files.map((f, i) => [i, f])),
  }
}

const png = { name: 'a.png', type: 'image/png', size: 1024 }
const jpg = { name: 'b.jpg', type: 'image/jpeg', size: 2048 }
const txt = { name: 'c.txt', type: 'text/plain', size: 10 }

describe('图片选择辅助函数', () => {
  test('快照后再清空源列表，不应影响已取到的数组', () => {
    const live = [png, jpg]
    const snapshot = toFileArray(fakeFileList(live))
    live.length = 0            // 模拟 input.value = '' 把活 FileList 清空
    assert.equal(snapshot.length, 2, '清空源列表后快照必须仍然完整')
    assert.equal(snapshot[0].name, 'a.png')
  })

  test('选图后若有 await 再读取，活 FileList 已空 —— 这就是曾经的 bug', async () => {
    const live = [png, jpg]
    const fileList = fakeFileList(live)

    // 消费者的错误写法：先 await（例如等上传限制接口），之后才读取
    const buggy = (async () => {
      await Promise.resolve()
      return Array.from(fileList)   // ← 读取发生在 await 之后
    })()
    live.length = 0                 // 期间组件执行 input.value = '' 清空活列表
    assert.equal((await buggy).length, 0, '证明了「先 await 后读取」必然拿到空列表')
  })

  test('正确写法：emit 前就快照，之后怎么 await 都不受影响', async () => {
    const live = [png, jpg]
    const fileList = fakeFileList(live)

    const correct = (async () => {
      const snapshot = toFileArray(fileList)   // ← 快照发生在最前面
      await Promise.resolve()
      await Promise.resolve()
      return snapshot
    })()
    live.length = 0                             // 随后才被清空
    const got = await correct
    assert.equal(got.length, 2, '快照在清空之前完成，必须拿到完整的 2 个文件')
    assert.deepEqual(got.map((f) => f.name), ['a.png', 'b.jpg'])
  })

  test('pickImageFiles 过滤掉非图片', () => {
    const got = pickImageFiles(fakeFileList([png, txt, jpg]))
    assert.deepEqual(got.map((f) => f.name), ['a.png', 'b.jpg'])
  })

  test('空输入与 null 安全', () => {
    assert.deepEqual(toFileArray(null), [])
    assert.deepEqual(toFileArray(undefined), [])
    assert.deepEqual(pickImageFiles(null), [])
    assert.deepEqual(pickImageFiles(fakeFileList([])), [])
  })

  test('没有 type 字段的项被安全过滤（不抛异常）', () => {
    const weird = { name: 'x', size: 1 }
    assert.deepEqual(pickImageFiles(fakeFileList([weird, png])).map((f) => f.name), ['a.png'])
  })
})
