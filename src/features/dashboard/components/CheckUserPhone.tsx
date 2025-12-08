import React, { useState, useEffect } from 'react';
import { Banner, Modal, Form, Button } from '@douyinfe/semi-ui';
import { updateCurrentUserMailAPI, checkWorkflowApprovalAPI } from '../../../api/service';

interface CheckUserPhoneProps {
  workflowName: string;
}

const CheckUserPhone: React.FC<CheckUserPhoneProps> = ({ workflowName }) => {
  const [dialogUpdatePhoneFormVisible, setDialogUpdatePhoneFormVisible] = useState(false);
  const [showPhoneCheckTip, setShowPhoneCheckTip] = useState(false);
  const [showUserCheckTip, setShowUserCheckTip] = useState(false);

  // 验证手机号格式
  const validatePhone = (rule: any, value: string) => {
    if (value === '') {
      return new Error('请填写手机号');
    } else {
      if (!/^(13[0-9]|14[01456879]|15[0-35-9]|16[2567]|17[0-8]|18[0-9]|19[0-35-9])\d{8}$/.test(value)) {
        return new Error('请输入正确的手机号码');
      }
    }
    return true;
  };

  // 检查工作流审批
  const checkWorkflowApproval = () => {
    if (!workflowName) return;
    
    checkWorkflowApprovalAPI(workflowName)
      .then(() => {
        setShowPhoneCheckTip(false);
      })
      .catch((error) => {
        if (error.response && error.response.data.code === 6941) {
          setShowPhoneCheckTip(true);
        } else if (error.response && error.response.data.code === 6940) {
          setShowUserCheckTip(true);
        }
      });
  };

  // 处理表单提交
  const handleFormSubmit = (values: any) => {
    const currentUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    
    const params = {
      name: currentUserInfo.name,
      phone: values.phone
    };

    updateCurrentUserMailAPI(currentUserInfo.uid, params)
      .then(() => {
        checkWorkflowApproval();
        setDialogUpdatePhoneFormVisible(false);
      })
      .catch((error) => {
        console.error('更新用户信息失败:', error);
      });
  };

  // 打开修改手机号对话框
  const updatePhoneDialog = () => {
    setShowPhoneCheckTip(false);
    setDialogUpdatePhoneFormVisible(true);
  };

  // 组件挂载时检查审批
  useEffect(() => {
    checkWorkflowApproval();
  }, [workflowName]);

  return (
    <div className="update-user-phone">
      <div className="error-info" style={{ marginBottom: 10 }}>
        {showPhoneCheckTip && (
          <Banner
            type="warning"
            icon
            description={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>审批发起人手机号码未找到，请正确配置您的手机号码</span>
                <Button theme="borderless" type="primary" size="default" onClick={updatePhoneDialog}>
                  点击修改
                </Button>
              </div>
            }
          />
        )}
        {showUserCheckTip && (
          <Banner
            type="warning"
            icon
            description="获取 IM 审批发起人账号信息失败"
          />
        )}
      </div>

      <Modal
        title="修改手机号"
        visible={dialogUpdatePhoneFormVisible}
        onCancel={() => setDialogUpdatePhoneFormVisible(false)}
        footer={
          <div>
            <Button 
              type="primary" 
              htmlType="submit"
              form="phone-form"
            >
              确认
            </Button>
            <Button 
              onClick={() => setDialogUpdatePhoneFormVisible(false)}
            >
              取消
            </Button>
          </div>
        }
        closeOnEsc={false}
        maskClosable={false}
      >
        <Form 
          labelPosition="left" 
          labelWidth={100}
          onSubmit={handleFormSubmit}
          id="phone-form"
        >
          <Form.Input
            field="phone"
            label="新手机号"
            rules={[
              { required: true, message: '请填写手机号' },
              { validator: validatePhone }
            ]}
            placeholder="请输入新手机号"
          />
        </Form>
      </Modal>
    </div>
  );
};

export default CheckUserPhone;
