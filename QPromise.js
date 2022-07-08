/**
 * V0.9版,在里面加入 如下功能:
 *  (1) 如果一个QPromise变为rejected状态,而且没有被其他QPromise处理,则最终冒泡到控制台,打印unCaught Error.
 *  (2) 无论是在onFulfilled函数里还是onRejected函数里抛出异常,都会导致QPromise实例变为reject状态
 * 
 */



class QPromise {

  //实现控制台打印未被处理的rejected的QPromise功能
  static allRejectedQPromise=new Set();

  static {
    setInterval(() => {
      if(QPromise.allRejectedQPromise.size>0){
        for(const reject of QPromise.allRejectedQPromise ){
          setTimeout(() => {
            QPromise.allRejectedQPromise.delete(reject);
            throw reject.reason;
          }, 0);
        }
        
      }
    }, 2000);
  }


  constructor(executor){
    this.status="pending";
    this.onFulfilledQueue=[];
    this.onRejectedQueue=[];
    this.resolve=this._resolve.bind(this);
    this.reject=this._reject.bind(this);

   
    if(typeof executor!=="function")
      throw new TypeError();

    try{
      executor(this.resolve,this.reject);
    }catch(e){
      this.reject(e);
    }
  }



  _resolve(result){

    if(result===this) 
      throw new TypeError("illegal parameter of resolve method");

    if(this.status!=="pending") return;

   
    //当前QPromise对象的状态依赖另外一个QPromise
    if(result instanceof QPromise){
      if(result.status==="pending"){
        result.onFulfilledQueue.push(res=>this.resolve(res));
        result.onRejectedQueue.push(err=>this.reject(err));
      }else if(result.status==="fulfilled"){
        queueMicrotask(()=>this.resolve(result.result));
      }else if(result.status==="rejected"){
        queueMicrotask(()=> this.reject(result.reason));
      }
      return;
    }

    //maybe thenable object
    let type=typeof result;
    if( result && (type==="object" || type==="function")){
      try{
        let then=result.then;
        if(typeof then !=="function"){
          // result是一个对象,但是不是一个thenable对象
          this.status="fulfilled";
          this.result=result;
          
          for(const fn of this.onFulfilledQueue){
            queueMicrotask(()=>fn(this.result));
          }
          return;
        }

        queueMicrotask(()=> then.call(result,res=>this.resolve(res),err=>this.reject(err)));

      }catch(e){
        this.reject(e);
      }
      return;
    }



    this.status="fulfilled";
    this.result=result;
    
    for(const fn of this.onFulfilledQueue){
      queueMicrotask(()=>fn(this.result));
    }
  }


  _reject(reason){
    if(this.status!=="pending") return;

    this.status="rejected";
    this.reason=reason;

    //实现未被catch的处于rejected状态的QPromise最终冒泡到控制台功能.
    if( this.onRejectedQueue.length===0){
     QPromise.allRejectedQPromise.add(this);
    }

    for(const fn of this.onRejectedQueue){
      queueMicrotask(()=>fn(this.reason));
    }
  }



  then(onFulfilled,onRejected){
    
    onFulfilled = (typeof onFulfilled==="function") ? onFulfilled : res=>res ;
    onRejected =  (typeof onRejected==="function") ? onRejected : err=>{ throw err; };


    if(this.status==="pending"){
      return new QPromise((resolve,reject)=>{
        this.onFulfilledQueue.push(()=>{
          try{
            resolve(onFulfilled(this.result));
          }catch(e){
            reject(e);
          }
        });

        this.onRejectedQueue.push(()=>{
          
          try{
            resolve(onRejected(this.reason));
          }catch(e){
            reject(e);
          }
        });
      });
    }else if(this.status==="fulfilled"){
      return new QPromise((resolve,reject)=>{
        queueMicrotask(()=>{
          try{
            resolve(onFulfilled(this.result));
          }catch(e){
            reject(e);
          }
        });
      });
    }else if(this.status==="rejected"){
      QPromise.allRejectedQPromise.delete(this);
      return new QPromise((resolve,reject)=>{

        queueMicrotask(()=>{
          try{
            resolve(onRejected(this.reason));
          }catch(e){
            reject(e);
          }
        });
      });
    }

  }

  catch(onRejected){
    return this.then(undefined,onRejected);
  }


  finally(finalFn){
    let onFulfilled = (typeof finalFn === "function") ? res=>{ finalFn(); return res;} : res=> res;

    let onRejected =  (typeof finalFn === "function") ? err=>{ finalFn();  throw err; } : err=>{ throw err; };

    return this.then(onFulfilled,onRejected);

  }

  //静态 resolve 方法
  static resolve(value){
    if(value instanceof QPromise) return value;

    return new QPromise((resolve,reject)=>resolve(value));
  }

  //静态 reject 方法
  static reject(reason){
    return new QPromise((_,reject)=>reject(reason));
  }


  //静态 all 方法
  static all(iterableObj){
   
    return new QPromise((resolve,reject)=>{
      let resultArray=[];
      let index=0;
      let notQPromiseCount=0;
      let QPromiseCount=0;
      for(const qp of iterableObj){
        let thisIndex=index++;
        
        if(qp instanceof QPromise){
          QPromiseCount++;
          qp.then(res=>{
            resultArray[thisIndex]=qp.result;
           
            if(--QPromiseCount===0) {
              resolve(resultArray);
            }
          },err=>reject(err));
        }else {
          notQPromiseCount++;
          resultArray[thisIndex]=qp;
        }
      }

      //如果iterableObj是空集合,则必须返回一个已完成（already resolved）
      if (index===0){
        resolve([]);
      }

       //如果传入的参数不包含任何 QPromise，则返回一个异步完成（asynchronously resolved）
      if(notQPromiseCount===index)
        queueMicrotask(()=>resolve(resultArray));
    });
  }

  //静态 allSettled 方法
  static allSettled(iterableObj){
    return new QPromise((resolve,reject)=>{
      let resultArray=[];
      let index=0;
      let notQPromiseCount=0;
      let QPromiseCount=0;

      for(const qp of iterableObj){
        const thisIndex=index++;
        if(qp instanceof QPromise){
          QPromiseCount++;
          qp.then(res=>{
            resultArray[thisIndex]={status:"fulfilled",result:res};
            if(--QPromiseCount===0) 
              resolve(resultArray);
          },err=>{
            resultArray[thisIndex]={status:"rejected",reason:err};
            if(--QPromiseCount===0) 
              resolve(resultArray);
          });
        }else{
          notQPromiseCount++;
          resultArray[thisIndex]={status:"fulfilled",result:qp};
        };

        if(index===0) resolve([]);

        if(notQPromiseCount===index) queueMicrotask(()=>resolve(resultArray));
      }
    });
  }

  //静态 any 方法
  static any(iterableObj){
    return new QPromise((resolve,reject)=>{
      let resultArray=[];
      let index=0;
      let notQPromiseCount=0;
      let QPromiseCount=0;

      for(const qp of iterableObj){
        const thisIndex=index++;

        if(qp instanceof QPromise){
          QPromiseCount++;
          qp.then(res=>{
            resolve(res);
          },err=>{
            resultArray[thisIndex]=err;
            if(--QPromiseCount===0){
              let error=new AggregateError(resultArray,"All promises were rejected");
              reject(error);
            }
          });
        }else {
          notQPromiseCount++;
          queueMicrotask(()=>resolve(qp));
        }
       
      }

      if(index===0){
        let error=new AggregateError([],"All promises were rejected");
        reject(error);
      }
    });
  }

  //静态 race 方法
  //传入空iterableObj将导致QPromise永远处于pending状态
  static race(iterableObj){
    return new QPromise((resolve,reject)=>{

      for(const qp of iterableObj){
        if(qp instanceof QPromise){
          qp.then(res=>resolve(res) ,err=>reject(err));
        }else {
          queueMicrotask(()=>resolve(qp));
        }
        
      }
    });
  }

}



