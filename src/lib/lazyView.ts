import { defineAsyncComponent, defineComponent, type AsyncComponentLoader, type Component } from "vue";
import { pushAppToast } from "./appToast";

const EmptyErrorView = defineComponent({ render: () => null });

export function defineLazyView<T extends Component>(
  loader: AsyncComponentLoader<T>,
  name: string,
  onFailure: () => void,
): T {
  return defineAsyncComponent({
    loader,
    errorComponent: EmptyErrorView,
    onError(_error, _retry, fail) {
      pushAppToast(`Failed to load ${name}. Reopen it to try again.`, "error");
      onFailure();
      fail();
    },
  });
}
