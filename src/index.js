// object with data of type and props to create dom
const createElement = (type, props, ...children) => ({
  type,
  props: {
    ...props,
    children: children.map((child) => (typeof child === 'object'
      ? child
      : createTextElement(child))),
  },
});

const createTextElement = (text) => ({
  type: 'TextElement',
  props: {
    nodeValue: text,
    children: [],
  },
});

const createDom = (fiber) => {
  const dom = fiber.type === 'TextElement'
    ? document.createTextNode('')
    : document.createElement(fiber.type);
    // Object.keys(fiber.props)
    //   .filter((key) => (key !== 'children'))
    //   .forEach((prop) => (dom[prop] = fiber.props[prop]))
  updateDom(dom, {}, fiber.props);
  return dom;
};

let nextUnitOfWork = null;
let wiproot = null;
let currentRoot = null;
let deletions = null;

const isEvent = (key) => key.startsWith('on');
const isProperty = (key) => key !== 'children' && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);
const updateDom = (dom, prevProps, nextProps) => {
  // remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps)
        || isNew(prevProps, nextProps)(key)) // remove all event listeners
    .forEach((name) => {
      const eventType = name
        .toLowerCase()
        .substring(2);
      dom.removeEventListener(
        eventType,
        prevProps[name],
      );
    });
  // remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = '';
    });
  // change new properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });
  // add new event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name
        .toLowerCase()
        .substring(2);
      dom.addEventListener(
        eventType,
        nextProps[name],
      );
    });
};

// sync to html dom
const commitRoot = () => {
  deletions.forEach(commitWork);
  // add nodes to dom
  commitWork(wiproot.child);
  currentRoot = wiproot;
  wiproot = null;
};

const commitWork = (fiber) => {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === 'PLACEMENT' && fiber.dom !== null) { // TODO fiber.dom
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom !== null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === 'DELETION') {
    commitDeletion(fiber, domParent);
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
};

const commitDeletion = (fiber, domParent) => {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
};

// set next unit of work
const render = (element, container) => {
  // set start
  wiproot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wiproot;
};

const workLoop = (deadline) => {
  // console.log('workLoop')
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    // console.log(wiproot)
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  if (!nextUnitOfWork && wiproot) {
    console.log('finish', wiproot)
    commitRoot();
  }
  requestIdleCallback(workLoop);
};

requestIdleCallback(workLoop); // start; while browser is idle, to call workLoop

// update fiber, set next fiber
const performUnitOfWork = (fiber) => {
  console.log(fiber)
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  //  return next unit of work
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
};

let wipFiber = null;
let hookIndex = null;

const updateFunctionComponent = (fiber) => {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
};

const useState = (initial) => {
  const oldHook = wipFiber.alternate
      && wipFiber.alternate.hooks
      && wipFiber.alternate.hooks[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });
  const setState = (action) => {
    hook.queue.push(action);
    wiproot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wiproot;
    deletions = [];
  };
  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
};

const updateHostComponent = (fiber) => {
  // add dom node
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  // create new fibers
  reconcileChildren(fiber, fiber.props.children);
};

const reconcileChildren = (wipFiber, elements) => {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevsibling = null;
  while (index < elements.length || oldFiber) {
    const element = elements[index];
    let newFiber = null;
    // compare oldFiber to element
    const isSameType = oldFiber && element && oldFiber.type === element.type;
    if (isSameType) {
      // update the node
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: 'UPDATE',
      };
    }
    if (element && !isSameType) {
      // add this node
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: 'PLACEMENT',
      };
    }
    if (oldFiber && !isSameType) {
      // delete the oldfiber's node
      oldFiber.effectTag = 'DELETION';
      deletions.push(oldFiber);
    }
    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevsibling.sibling = newFiber;
    }
    prevsibling = newFiber;
    index++;
  }
};

const Didact = {
  createElement,
  render,
  useState,
};

/** @jsx Didact.createElement */
function Counter() {
  const [state, setState] = Didact.useState(1);
  return (
    <h1 onClick={() => setState((c) => c + 1)}>
      Count:
      {state}
    </h1>
  );
}
const test = (
  <div>
    <div>
      123
    </div>
    <h1>mm</h1>
  </div>
);
const element = <Counter />;
const container = document.getElementById('root');
Didact.render(test, container); // start
