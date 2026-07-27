import { isEqual } from 'lodash'
import * as vscode from 'vscode'
import { LucideIconName } from '../lucide-icons'

type IndexedQuickPickItem = vscode.QuickPickItem & { index: number }

export type QuickPickControls<Step extends string> = {
  currentStep: Step
  inputValue: string
  setLoading: (val: boolean) => void
  setInputValue: (val: string) => void
  goToStep: (step: Step) => void
  dispose: () => void
  hide: () => void
  show: () => void
}

export type Command<Step extends string> = Omit<vscode.QuickPickItem, 'iconPath'> & {
  icon?: LucideIconName
  action: Step | ((controls: QuickPickControls<Step>) => void)
  enabled?: (controls: QuickPickControls<Step>) => boolean
}

type BackButtonConfig<Step extends string> = Step | ((controls: QuickPickControls<Step>) => void)

type StepConfig<Step extends string> = {
  backBtn?: BackButtonConfig<Step>
  title: string | (() => string)
  placeholder: string | (() => string)
  inputValue?: string
  commands: Command<Step>[] | ((controls: QuickPickControls<Step>) => Command<Step>[])
  matchOnDetail?: boolean
  matchOnDescription?: boolean
}

// export type BackButtonHandler<Step extends string> = (controls: QuickPickControls<Step>) => void

export type QuickPickConfig<Step extends string> = Record<Step, StepConfig<Step>>

type StateBeforeLoading = {
  placeholder: string
  inputValue: string
  items: IndexedQuickPickItem[]
}

export class ControlledQuickPicker<Step extends string> {
  public onDidHideCallback: (() => void) | null = null

  private quickPickConfig: QuickPickConfig<Step>
  private quickPick: vscode.QuickPick<IndexedQuickPickItem>
  private currentStep: Step
  private stateBeforeLoading: StateBeforeLoading | null = null
  private isHiddenManually: boolean = false

  constructor(config: QuickPickConfig<Step>) {
    this.quickPickConfig = config

    this.quickPick = vscode.window.createQuickPick<IndexedQuickPickItem>()
    this.quickPick.onDidAccept(() => this.#onDidAcceptHandler())
    this.quickPick.onDidChangeValue(() => this.#onDidChangeValueHandler())
    this.quickPick.onDidTriggerButton((button) => this.#onDidTriggerButtonHandler(button))
    this.quickPick.onDidHide(() => this.#onDidHideHandler())

    this.currentStep = Object.keys(this.quickPickConfig)[0] as Step
    this.#goToStep(this.currentStep)
    this.quickPick.show()
  }

  get controls(): QuickPickControls<Step> {
    return {
      currentStep: this.currentStep,
      inputValue: this.quickPick.value,
      setLoading: (val) => this.#setLoading(val),
      setInputValue: (val: string) => (this.quickPick.value = val),
      goToStep: (step) => this.#goToStep(step),
      dispose: () => this.quickPick.dispose(),
      hide: () => {
        this.isHiddenManually = true
        this.quickPick.hide()
      },
      show: () => {
        this.isHiddenManually = false
        this.quickPick.show()
      },
    }
  }

  #setLoading(isLoading: boolean) {
    if (isLoading) {
      if (!this.stateBeforeLoading) {
        this.stateBeforeLoading = {
          placeholder: this.quickPick.placeholder ?? '',
          inputValue: this.quickPick.value,
          items: [...this.quickPick.items],
        }
      }
      this.quickPick.busy = true
      this.quickPick.placeholder = 'Loading...'
      this.quickPick.value = ''
      this.quickPick.items = []
    } else {
      this.quickPick.busy = false
      if (this.stateBeforeLoading) {
        this.quickPick.placeholder = this.stateBeforeLoading.placeholder
        this.quickPick.value = this.stateBeforeLoading.inputValue
        this.quickPick.items = this.stateBeforeLoading.items
        this.stateBeforeLoading = null
      }
    }
  }

  #goToStep(step: Step) {
    this.quickPick.busy = false
    this.stateBeforeLoading = null

    const stepInfo = this.quickPickConfig[step]
    this.quickPick.title = this.#computeValue(stepInfo.title)
    this.quickPick.placeholder = this.#computeValue(stepInfo.placeholder)

    this.quickPick.value = stepInfo.inputValue ?? ''
    this.currentStep = step

    const buttons: vscode.QuickInputButton[] = []
    if (stepInfo.backBtn) {
      buttons.push(vscode.QuickInputButtons.Back)
      // add Close too, so user can exit even mid-flow
      buttons.push({ iconPath: new vscode.ThemeIcon('close') })
    }
    this.quickPick.buttons = buttons
    // keep open while buttons are shown
    this.quickPick.ignoreFocusOut = !!buttons.length

    this.quickPick.matchOnDetail = stepInfo.matchOnDetail ?? false
    this.quickPick.matchOnDescription = stepInfo.matchOnDescription ?? false

    // must run after currentStep is updated above
    this.#updateQuickPickItems(this.#computeVisibleQuickPickItems(step))
  }

  #onDidAcceptHandler() {
    if (!this.#computeVisibleQuickPickItems(this.currentStep).length) {
      return
    }

    const selectedCommand = this.quickPick.selectedItems[0]
    if (!selectedCommand) {
      return
    }

    const commandInfo = this.#computeIndexedCommands(this.currentStep)[selectedCommand.index]
    if (typeof commandInfo.action === 'function') {
      commandInfo.action(this.controls)
    } else {
      this.#goToStep(commandInfo.action)
    }
  }

  #onDidChangeValueHandler() {
    this.#updateQuickPickItems(this.#computeVisibleQuickPickItems(this.currentStep))
  }

  #updateQuickPickItems(newItems: IndexedQuickPickItem[]) {
    if (isEqual(this.quickPick.items, newItems)) {
      return
    }
    this.quickPick.items = newItems
  }

  #onDidTriggerButtonHandler(button: vscode.QuickInputButton) {
    if (button === vscode.QuickInputButtons.Back) {
      this.#executeBackButton(this.quickPickConfig[this.currentStep].backBtn!)
    } else {
      // close button
      this.quickPick.dispose()
    }
  }

  #onDidHideHandler() {
    if (this.isHiddenManually) {
      // manual hide is temporary — don't fire listeners
      return
    }

    const backBtnHandler = this.quickPickConfig[this.currentStep].backBtn
    if (backBtnHandler) {
      this.#executeBackButton(backBtnHandler)
      this.quickPick.show()
    } else if (this.onDidHideCallback) {
      this.onDidHideCallback()
    }
  }

  #executeBackButton(backButtonConfig: BackButtonConfig<Step>) {
    if (typeof backButtonConfig === 'function') {
      backButtonConfig(this.controls)
    } else {
      this.#goToStep(backButtonConfig)
    }
  }

  #computeValue<T>(val: T | (() => T)) {
    if (typeof val === 'function') {
      return (val as () => T)()
    } else {
      return val
    }
  }

  #computeIndexedCommands(step: Step) {
    const commands =
      typeof this.quickPickConfig[step].commands === 'function'
        ? this.quickPickConfig[step].commands(this.controls)
        : this.quickPickConfig[step].commands
    return commands.map((c, index) => ({ ...c, index }))
  }

  #computeVisibleQuickPickItems(step: Step): IndexedQuickPickItem[] {
    if (this.quickPick.busy) {
      return []
    }

    const commands = this.#computeIndexedCommands(step)
    return commands
      .filter((c) => c.enabled === undefined || c.enabled(this.controls))
      .map((c) => {
        return {
          ...c,
          iconPath: c.icon ? new vscode.ThemeIcon(c.icon) : undefined,
        } satisfies IndexedQuickPickItem
      })
  }
}
