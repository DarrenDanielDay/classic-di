# classic-di

English | [简体中文](./README.zh-CN.md)

---

[![Auto Test CI](https://github.com/DarrenDanielDay/classic-di/actions/workflows/test.yml/badge.svg)](https://github.com/DarrenDanielDay/classic-di/actions/) [![Publish CI](https://github.com/DarrenDanielDay/classic-di/actions/workflows/publish.yml/badge.svg)](https://github.com/DarrenDanielDay/classic-di/actions/) [![npm version](https://badge.fury.io/js/classic-di.svg)](https://badge.fury.io/js/classic-di)

Classic dependency injection implementation with ECMA Decorators.

⚠ This library is experimental. There may be breaking changes to the APIs before the official release.

## Requirements

- TypeScript 5.2

## Example

```ts
import { Container, Injectable, token } from "classic-di";

// 1. Declare services with types.
interface Dep1 {
  foo(): number;
}
interface Dep2 {
  bar(): string;
}
interface Dep3 {
  baz(): boolean;
}

// 2. Create tokens for services.
const dep1 = token<Dep1>("dep1");
const dep2 = token<Dep2>("dep2");
const dep3 = token<Dep3>("dep3");

// 3. Decorate with `Injectable` for classes.
@Injectable({
  // Declare what service to implement.
  implements: dep1,
})
class A implements Dep1 {
  foo() {
    return 666;
  }
}

@Injectable({
  implements: dep2,
  // Declare dependencies with token.
  requires: [dep1] as const,
})
class B implements Dep2 {
  // Consume dependencies in constructor. Dependencies are injected in declared order.
  constructor(public dep1: Dep1) {}
  bar() {
    return this.dep1.foo().toString();
  }
}

@Injectable({
  implements: dep3,
  requires: [dep2] as const,
})
class C implements Dep3 {
  constructor(public dep2: Dep2) {}
  baz(): boolean {
    return this.dep2.bar() === "666";
  }
}

// 4. Create IoC container and register implementations.

const container = new Container();
container.register(A);
container.register(B);
container.register(C);

// 5. Create service instances with `get` method.
const dep3Impl = container.get(dep3); // an instance of C
```

## License

```text
 __________________
< The MIT license! >
 ------------------
        \   ^__^
         \  (oo)\_______
            (__)\       )\/\
                ||----w |
                ||     ||
```
