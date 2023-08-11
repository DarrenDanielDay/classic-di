# classic-di

[English](./README.md) | 简体中文

---

[![Auto Test CI](https://github.com/DarrenDanielDay/classic-di/actions/workflows/test.yml/badge.svg)](https://github.com/DarrenDanielDay/classic-di/actions/) [![Publish CI](https://github.com/DarrenDanielDay/classic-di/actions/workflows/publish.yml/badge.svg)](https://github.com/DarrenDanielDay/classic-di/actions/) [![npm version](https://badge.fury.io/js/classic-di.svg)](https://badge.fury.io/js/classic-di)

使用ECMA Decorators实现的经典依赖注入。

⚠ 此库仍然是实验性的。在正式发布之前，API可能会发生重大变更。

## 需求


- TypeScript 5.2

## 示例

```ts
import { Container, Injectable, token } from "classic-di";

// 1. 使用类型声明服务。
interface Dep1 {
  foo(): number;
}
interface Dep2 {
  bar(): string;
}
interface Dep3 {
  baz(): boolean;
}

// 2. 为服务创建令牌。
const dep1 = token<Dep1>("dep1");
const dep2 = token<Dep2>("dep2");
const dep3 = token<Dep3>("dep3");

// 3. 使用`Injectable`装饰类。
@Injectable({
  // 声明所实现的服务。
  implements: dep1,
})
class A implements Dep1 {
  foo() {
    return 666;
  }
}

@Injectable({
  implements: dep2,
  // 声明所依赖的服务。
  requires: [dep1] as const,
})
class B implements Dep2 {
  // 在构造函数内消费服务。依赖以声明的顺序注入。
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

// 4. 创建IoC容器并注册实现类。

const container = new Container();
container.register(A);
container.register(B);
container.register(C);

// 5. 通过`get`方法创建服务实例。
const dep3Impl = container.get(dep3); // 一个C的实例
```

## 许可证

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
